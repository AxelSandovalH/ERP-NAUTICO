import type { MetodoPago } from "@prisma/client";
import type { Tx } from "@/lib/db/tenant";
import { aDate, aIso } from "@/lib/fechas";
import { calcularComision, elegirRegla, periodoDe, repartirAbono, type Regla } from "./calcular";

export class ErrorComision extends Error {}

export async function periodoCerrado(tx: Tx, periodo: string): Promise<boolean> {
  const c = await tx.cierreComision.findFirst({ where: { periodo, cerrado: true }, select: { id: true } });
  return !!c;
}

const estadoPorPago = (monto: number, pagado: number) => (monto > 0 && pagado >= monto ? "PAGADA" : "PENDIENTE") as "PAGADA" | "PENDIENTE";

export type ResultadoRecalculo =
  | "sin_beneficiario" | "periodo_cerrado" | "manual" | "cancelada" | "creada" | "actualizada";

/** Calcula (o recalcula) la comisión de una reserva según las tarifas vigentes
 *  del beneficiario. Respeta periodos cerrados y montos ajustados a mano. */
export async function recalcularComisionReserva(tx: Tx, tenantId: string, reservaId: string, moneda = "MXN"): Promise<ResultadoRecalculo> {
  const r = await tx.reserva.findUnique({ where: { id: reservaId }, include: { embarcacion: true } });
  if (!r) throw new ErrorComision("La reserva no existe.");
  const periodo = periodoDe(aIso(r.fecha));
  const existente = await tx.comision.findUnique({ where: { reservaId } });

  if (await periodoCerrado(tx, periodo)) return "periodo_cerrado";

  if (r.estado === "CANCELADA") {
    // Una comisión ya pagada (aunque sea en parte) no se cancela sola: la revisa una persona
    if (existente && existente.pagadoCentavos === 0 && existente.estado !== "CANCELADA") {
      await tx.comision.update({ where: { id: existente.id }, data: { estado: "CANCELADA" } });
    }
    return "cancelada";
  }

  if (!r.beneficiarioId) {
    if (existente && existente.pagadoCentavos === 0 && !existente.manual) await tx.comision.delete({ where: { id: existente.id } });
    return "sin_beneficiario";
  }
  if (existente?.manual) return "manual";

  const filas = await tx.tarifaComision.findMany({ where: { beneficiarioId: r.beneficiarioId, activa: true } });
  const reglas: Regla[] = filas.map((f) => ({ id: f.id, embarcacionId: f.embarcacionId, origen: f.origen, tipo: f.tipo, valor: f.valor, umbralPax: f.umbralPax, valorAlto: f.valorAlto, creadoEn: f.creadoEn }));
  const regla = elegirRegla(reglas, { embarcacionId: r.embarcacionId, origen: r.origen });
  const calc = calcularComision(regla, { totalCentavos: r.totalCentavos, pax: r.pax, casa: r.embarcacion, moneda });

  const datos = {
    beneficiarioId: r.beneficiarioId, periodo, baseCentavos: r.totalCentavos,
    montoCentavos: calc.montoCentavos, regla: calc.descripcion, advertencia: calc.advertencia ?? null,
  };
  if (existente) {
    await tx.comision.update({ where: { id: existente.id }, data: { ...datos, estado: estadoPorPago(calc.montoCentavos, existente.pagadoCentavos) } });
    return "actualizada";
  }
  await tx.comision.create({ data: { ...datos, tenantId, reservaId, estado: estadoPorPago(calc.montoCentavos, 0) } });
  return "creada";
}

/** Recalcula todas las comisiones de un mes (salvo las manuales). */
export async function recalcularPeriodo(tx: Tx, tenantId: string, periodo: string, moneda = "MXN") {
  if (await periodoCerrado(tx, periodo)) throw new ErrorComision(`El periodo ${periodo} está cerrado. Reábrelo para recalcular.`);
  const reservas = await tx.reserva.findMany({
    where: { fecha: { gte: aDate(`${periodo}-01`), lt: aDate(`${siguienteMes(periodo)}-01`) } }, select: { id: true },
  });
  const cuenta = { creada: 0, actualizada: 0, otras: 0 };
  for (const { id } of reservas) {
    const res = await recalcularComisionReserva(tx, tenantId, id, moneda);
    if (res === "creada") cuenta.creada++; else if (res === "actualizada") cuenta.actualizada++; else cuenta.otras++;
  }
  return cuenta;
}

function siguienteMes(periodo: string) {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

/** Fija el monto a mano. La comisión queda marcada y el recálculo ya no la toca. */
export async function ajustarMonto(tx: Tx, comisionId: string, nuevoMonto: number, motivo: string) {
  const c = await tx.comision.findUnique({ where: { id: comisionId } });
  if (!c) throw new ErrorComision("La comisión no existe.");
  if (await periodoCerrado(tx, c.periodo)) throw new ErrorComision(`El periodo ${c.periodo} está cerrado.`);
  if (c.estado === "CANCELADA") throw new ErrorComision("La comisión está cancelada.");
  if (nuevoMonto < c.pagadoCentavos) throw new ErrorComision("El monto no puede ser menor a lo ya pagado.");
  await tx.comision.update({
    where: { id: c.id },
    data: { montoCentavos: nuevoMonto, manual: true, regla: "Ajuste manual", advertencia: null, notas: motivo, estado: estadoPorPago(nuevoMonto, c.pagadoCentavos) },
  });
}

export type EntradaAbono = { beneficiarioId: string; montoCentavos: number; metodo: MetodoPago; referencia?: string; notas?: string; registradoPorId?: string };

/** Registra un pago al beneficiario y lo aplica a sus comisiones pendientes,
 *  las más antiguas primero. No permite pagar más de lo que se le debe. */
export async function registrarAbono(tx: Tx, tenantId: string, e: EntradaAbono) {
  if (!Number.isInteger(e.montoCentavos) || e.montoCentavos <= 0) throw new ErrorComision("El monto debe ser mayor a cero.");
  // Dos abonos simultáneos al mismo beneficiario no deben aplicarse a la misma comisión
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"abono" + e.beneficiarioId}, 0))`;
  const b = await tx.beneficiario.findUnique({ where: { id: e.beneficiarioId }, select: { id: true } });
  if (!b) throw new ErrorComision("El beneficiario no existe.");

  const pendientes = await tx.comision.findMany({
    where: { beneficiarioId: e.beneficiarioId, estado: "PENDIENTE" },
    include: { reserva: { select: { fecha: true, inicioMin: true } } },
  });
  const ordenadas = pendientes
    .filter((c) => c.montoCentavos > c.pagadoCentavos)
    .sort((a, c) => a.reserva.fecha.getTime() - c.reserva.fecha.getTime() || a.reserva.inicioMin - c.reserva.inicioMin || a.creadoEn.getTime() - c.creadoEn.getTime());
  const totalPendiente = ordenadas.reduce((s, c) => s + (c.montoCentavos - c.pagadoCentavos), 0);
  const { aplicaciones, sobrante } = repartirAbono(e.montoCentavos, ordenadas.map((c) => ({ id: c.id, faltante: c.montoCentavos - c.pagadoCentavos })));
  if (sobrante > 0) throw new ErrorComision(`El abono excede lo pendiente (${(totalPendiente / 100).toFixed(2)}).`);

  const abono = await tx.abonoComision.create({
    data: { tenantId, beneficiarioId: e.beneficiarioId, montoCentavos: e.montoCentavos, metodo: e.metodo, referencia: e.referencia || null, notas: e.notas || null, registradoPorId: e.registradoPorId },
  });
  for (const ap of aplicaciones) {
    const c = ordenadas.find((x) => x.id === ap.id)!;
    const pagado = c.pagadoCentavos + ap.monto;
    await tx.abonoAplicacion.create({ data: { tenantId, abonoId: abono.id, comisionId: c.id, montoCentavos: ap.monto } });
    const liquidada = pagado >= c.montoCentavos;
    await tx.comision.update({ where: { id: c.id }, data: { pagadoCentavos: pagado, estado: liquidada ? "PAGADA" : "PENDIENTE", pagadaEn: liquidada ? new Date() : null } });
  }
  return abono;
}

/** Deshace un abono: devuelve a cada comisión lo que se le había aplicado. */
export async function anularAbono(tx: Tx, abonoId: string) {
  const abono = await tx.abonoComision.findUnique({ where: { id: abonoId }, include: { aplicaciones: true } });
  if (!abono) throw new ErrorComision("El abono no existe.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"abono" + abono.beneficiarioId}, 0))`;
  for (const ap of abono.aplicaciones) {
    const c = await tx.comision.findUnique({ where: { id: ap.comisionId } });
    if (!c) continue;
    const pagado = Math.max(0, c.pagadoCentavos - ap.montoCentavos);
    await tx.comision.update({
      where: { id: c.id },
      data: { pagadoCentavos: pagado, estado: c.estado === "CANCELADA" ? "CANCELADA" : estadoPorPago(c.montoCentavos, pagado), pagadaEn: null },
    });
  }
  await tx.abonoComision.delete({ where: { id: abonoId } });
}

export async function cerrarPeriodo(tx: Tx, tenantId: string, periodo: string, usuarioId: string) {
  const previo = await tx.cierreComision.findUnique({ where: { tenantId_periodo: { tenantId, periodo } } });
  if (previo?.cerrado) throw new ErrorComision(`El periodo ${periodo} ya está cerrado.`);
  if (previo) {
    await tx.cierreComision.update({ where: { id: previo.id }, data: { cerrado: true, cerradoPorId: usuarioId, cerradoEn: new Date() } });
  } else {
    await tx.cierreComision.create({ data: { tenantId, periodo, cerradoPorId: usuarioId } });
  }
}

export async function reabrirPeriodo(tx: Tx, tenantId: string, periodo: string, usuarioId: string, motivo: string) {
  if (motivo.trim().length < 3) throw new ErrorComision("Indica el motivo de la reapertura.");
  const previo = await tx.cierreComision.findUnique({ where: { tenantId_periodo: { tenantId, periodo } } });
  if (!previo?.cerrado) throw new ErrorComision(`El periodo ${periodo} no está cerrado.`);
  await tx.cierreComision.update({ where: { id: previo.id }, data: { cerrado: false, reabiertoPorId: usuarioId, reabiertoEn: new Date(), motivoReapertura: motivo.trim() } });
}
