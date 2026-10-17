import type { MetodoPago, TipoConcepto } from "@prisma/client";
import type { Tx } from "@/lib/db/tenant";
import { aDate, aIso, hoyIso } from "@/lib/fechas";
import { calcularBruto, clasificarDias, contar, netoDe, type EstadoDia } from "./calculo";
import { diasEntre, type Periodicidad, type Periodo } from "./periodos";

export class ErrorNomina extends Error {}

/** Suma los conceptos del pago y actualiza bonos, deducciones y neto. */
async function recalcularTotales(tx: Tx, pagoId: string) {
  const pago = await tx.pagoNomina.findUniqueOrThrow({ where: { id: pagoId }, include: { conceptos: true } });
  const suma = (t: TipoConcepto) => pago.conceptos.filter((c) => c.tipo === t).reduce((a, c) => a + c.montoCentavos, 0);
  const bonos = suma("BONO"), deducciones = suma("DEDUCCION");
  return tx.pagoNomina.update({
    where: { id: pagoId },
    data: { bonosCentavos: bonos, deduccionesCentavos: deducciones, netoCentavos: netoDe(pago.brutoCentavos, bonos, deducciones) },
  });
}

/** Crea o recalcula el pago de un empleado para un periodo, con la asistencia actual.
 *  Los pagos ya PAGADOS no se tocan. Un pago CANCELADO vuelve a PENDIENTE. */
export async function generarPago(tx: Tx, tenantId: string, empleadoId: string, periodo: Periodo) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"pago" + empleadoId + periodo.inicio}, 0))`;
  const emp = await tx.empleado.findUnique({ where: { id: empleadoId } });
  if (!emp) throw new ErrorNomina("El empleado no existe.");
  const previo = await tx.pagoNomina.findUnique({
    where: { empleadoId_periodoInicio_periodoFin: { empleadoId, periodoInicio: aDate(periodo.inicio), periodoFin: aDate(periodo.fin) } },
  });
  if (previo?.estado === "PAGADO") throw new ErrorNomina("Ese periodo ya está pagado. Cancélalo si necesitas rehacerlo.");

  const dias = diasEntre(periodo.inicio, periodo.fin);
  const entradas = await tx.checada.findMany({
    where: { empleadoId, tipo: "ENTRADA", dia: { gte: aDate(periodo.inicio), lte: aDate(periodo.fin) } }, select: { dia: true },
  });
  const manuales = await tx.diaAsistencia.findMany({ where: { empleadoId, fecha: { gte: aDate(periodo.inicio), lte: aDate(periodo.fin) } } });
  const clasificados = clasificarDias(
    dias, new Set(entradas.map((c) => aIso(c.dia))), new Map<string, EstadoDia>(manuales.map((m) => [aIso(m.fecha), m.estado])),
  );
  // "Hoy" en la zona del negocio: los días por venir no son faltantes de registro
  const zona = (await tx.tenant.findUnique({ where: { id: tenantId }, select: { zonaHoraria: true } }))?.zonaHoraria;
  const conteos = contar(clasificados, hoyIso(zona));
  const { brutoCentavos, descuentoFaltasCentavos, descripcionDescuento } = calcularBruto({
    esquema: emp.esquema, sueldoCentavos: emp.sueldoCentavos, diasPeriodo: dias.length, conteos,
  });

  const base = {
    esquema: emp.esquema, sueldoCentavos: emp.sueldoCentavos, diasPeriodo: dias.length, diasTrabajados: conteos.trabajados,
    diasFalta: conteos.falta, diasSinRegistro: conteos.sinRegistro, brutoCentavos, estado: "PENDIENTE" as const, pagadoEn: null, metodo: null, referencia: null,
  };
  const pago = previo
    ? await tx.pagoNomina.update({ where: { id: previo.id }, data: base })
    : await tx.pagoNomina.create({ data: { ...base, tenantId, empleadoId, periodoInicio: aDate(periodo.inicio), periodoFin: aDate(periodo.fin), netoCentavos: 0 } });

  // El descuento por faltas es automático: se rehace en cada cálculo y no toca lo capturado a mano
  await tx.conceptoNomina.deleteMany({ where: { pagoId: pago.id, automatico: true } });
  if (descuentoFaltasCentavos > 0 && descripcionDescuento)
    await tx.conceptoNomina.create({ data: { tenantId, pagoId: pago.id, tipo: "DEDUCCION", concepto: descripcionDescuento, montoCentavos: descuentoFaltasCentavos, automatico: true } });
  return recalcularTotales(tx, pago.id);
}

/** Genera (o recalcula) los pagos de todos los empleados activos de esa periodicidad. */
export async function generarNominaPeriodo(tx: Tx, tenantId: string, periodicidad: Periodicidad, periodo: Periodo) {
  const empleados = await tx.empleado.findMany({ where: { activo: true, periodicidad }, select: { id: true } });
  const r = { generados: 0, yaPagados: 0 };
  for (const { id } of empleados) {
    try { await generarPago(tx, tenantId, id, periodo); r.generados++; }
    catch (e) { if (e instanceof ErrorNomina) r.yaPagados++; else throw e; }
  }
  return r;
}

async function pagoPendiente(tx: Tx, pagoId: string) {
  const p = await tx.pagoNomina.findUnique({ where: { id: pagoId } });
  if (!p) throw new ErrorNomina("El pago no existe.");
  if (p.estado !== "PENDIENTE") throw new ErrorNomina(p.estado === "PAGADO" ? "El pago ya está pagado." : "El pago está cancelado.");
  return p;
}

export async function agregarConcepto(tx: Tx, tenantId: string, pagoId: string, c: { tipo: TipoConcepto; concepto: string; montoCentavos: number; notas?: string }) {
  await pagoPendiente(tx, pagoId);
  if (!Number.isInteger(c.montoCentavos) || c.montoCentavos <= 0) throw new ErrorNomina("El monto debe ser mayor a cero.");
  if (c.concepto.trim().length < 2) throw new ErrorNomina("Escribe el concepto.");
  await tx.conceptoNomina.create({ data: { tenantId, pagoId, tipo: c.tipo, concepto: c.concepto.trim(), montoCentavos: c.montoCentavos, notas: c.notas || null } });
  return recalcularTotales(tx, pagoId);
}

export async function quitarConcepto(tx: Tx, conceptoId: string) {
  const c = await tx.conceptoNomina.findUnique({ where: { id: conceptoId } });
  if (!c) throw new ErrorNomina("El concepto no existe.");
  if (c.automatico) throw new ErrorNomina("Ese concepto lo calcula el sistema; se rehace al recalcular.");
  await pagoPendiente(tx, c.pagoId);
  await tx.conceptoNomina.delete({ where: { id: conceptoId } });
  return recalcularTotales(tx, c.pagoId);
}

/** Marca como pagado. Antes recalcula con la asistencia de este momento, para no pagar cifras viejas. */
export async function marcarPagado(tx: Tx, tenantId: string, pagoId: string, e: { metodo: MetodoPago; referencia?: string }) {
  const p = await pagoPendiente(tx, pagoId);
  const fresco = await generarPago(tx, tenantId, p.empleadoId, { inicio: aIso(p.periodoInicio), fin: aIso(p.periodoFin), etiqueta: "", dias: p.diasPeriodo });
  return tx.pagoNomina.update({ where: { id: fresco.id }, data: { estado: "PAGADO", metodo: e.metodo, referencia: e.referencia || null, pagadoEn: new Date() } });
}

export async function cancelarPago(tx: Tx, pagoId: string) {
  const p = await tx.pagoNomina.findUnique({ where: { id: pagoId } });
  if (!p) throw new ErrorNomina("El pago no existe.");
  if (p.estado === "CANCELADO") throw new ErrorNomina("El pago ya está cancelado.");
  return tx.pagoNomina.update({ where: { id: pagoId }, data: { estado: "CANCELADO", pagadoEn: null } });
}
