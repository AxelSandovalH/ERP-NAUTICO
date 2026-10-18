import type { Tx } from "@/lib/db/tenant";
import { aDate, aIso, esIso } from "@/lib/fechas";
import { cancelarIngresoDeTraslado, registrarGasto, registrarIngreso } from "@/lib/finanzas/servicio";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { errorDeTraslado, traslapan } from "./horario";

export class ErrorTransporte extends Error {}

// ─── unidades ────────────────────────────────────────────────────────────────

export async function guardarUnidad(tx: Tx, tenantId: string, id: string | null, e: { nombre: string; placas?: string; capacidad: number; notas?: string; activa?: boolean }) {
  const nombre = e.nombre.trim();
  if (nombre.length < 2) throw new ErrorTransporte("Escribe el nombre de la unidad.");
  if (!Number.isInteger(e.capacidad) || e.capacidad < 1 || e.capacidad > 200) throw new ErrorTransporte("La capacidad debe ser de 1 a 200 pasajeros.");
  if (await tx.unidadTransporte.findFirst({ where: { nombre, ...(id ? { id: { not: id } } : {}) }, select: { id: true } })) throw new ErrorTransporte("Ya tienes una unidad con ese nombre.");
  const datos = { nombre, placas: e.placas?.trim() || null, capacidad: e.capacidad, notas: e.notas?.trim() || null };
  if (id) {
    if (!(await tx.unidadTransporte.findUnique({ where: { id }, select: { id: true } }))) throw new ErrorTransporte("La unidad no existe.");
    return tx.unidadTransporte.update({ where: { id }, data: { ...datos, ...(e.activa === undefined ? {} : { activa: e.activa }) } });
  }
  return tx.unidadTransporte.create({ data: { tenantId, ...datos } });
}

// ─── traslados ───────────────────────────────────────────────────────────────

export type EntradaTraslado = {
  reservaId: string; tipo: "IDA" | "REGRESO"; fecha: string; horaMin: number; duracionMin: number; origen: string; destino: string; pax: number;
  unidadId?: string | null; choferId?: string | null; precioCentavos: number; notas?: string; usuarioId?: string;
};

/** Valida unidad, chofer y que no se empalmen con otro traslado ni con un descanso/ausencia del chofer en Horarios. */
async function validarRecursos(tx: Tx, e: EntradaTraslado, excluirId: string | null) {
  // Serializa los traslados de un mismo día: dos altas simultáneas no pueden asignar la misma unidad o chofer a la vez
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"traslado:" + e.fecha}, 0))`;
  const delDia = await tx.traslado.findMany({ where: { fecha: aDate(e.fecha), estado: { not: "CANCELADO" }, ...(excluirId ? { id: { not: excluirId } } : {}) }, select: { unidadId: true, choferId: true, horaMin: true, duracionMin: true } });
  const choca = (campo: "unidadId" | "choferId", id: string) => delDia.find((t) => t[campo] === id && traslapan(e.horaMin, e.duracionMin, t.horaMin, t.duracionMin));
  if (e.unidadId) {
    const u = await tx.unidadTransporte.findUnique({ where: { id: e.unidadId } });
    if (!u || !u.activa) throw new ErrorTransporte("La unidad no existe o está inactiva.");
    if (u.capacidad < e.pax) throw new ErrorTransporte(`${u.nombre} lleva hasta ${u.capacidad} pasajeros y el traslado es de ${e.pax}.`);
    const t = choca("unidadId", u.id);
    if (t) throw new ErrorTransporte(`${u.nombre} ya tiene otro traslado a las ${minutosAHora(t.horaMin)} ese día.`);
  }
  if (e.choferId) {
    const c = await tx.empleado.findUnique({ where: { id: e.choferId } });
    if (!c || !c.activo) throw new ErrorTransporte("El chofer no existe o está inactivo.");
    const t = choca("choferId", c.id);
    if (t) throw new ErrorTransporte(`${c.nombre} ya tiene otro traslado a las ${minutosAHora(t.horaMin)} ese día.`);
    const ausencia = await tx.turnoEmpleado.findFirst({ where: { empleadoId: c.id, fecha: aDate(e.fecha), tipo: { not: "TURNO" } }, select: { etiqueta: true } });
    if (ausencia) throw new ErrorTransporte(`${c.nombre} tiene «${ausencia.etiqueta}» ese día en Horarios.`);
  }
}

export async function guardarTraslado(tx: Tx, tenantId: string, id: string | null, e: EntradaTraslado) {
  if (!esIso(e.fecha)) throw new ErrorTransporte("Fecha inválida.");
  const err = errorDeTraslado(e);
  if (err) throw new ErrorTransporte(err);
  const reserva = await tx.reserva.findUnique({ where: { id: e.reservaId }, select: { id: true, estado: true } });
  if (!reserva) throw new ErrorTransporte("La reserva no existe.");
  const previo = id ? await tx.traslado.findUnique({ where: { id } }) : null;
  if (id && !previo) throw new ErrorTransporte("El traslado no existe.");
  if (!id && reserva.estado === "CANCELADA") throw new ErrorTransporte("La reserva está cancelada.");
  if (previo) {
    if (previo.estado !== "PROGRAMADO") throw new ErrorTransporte("Solo se edita un traslado programado.");
    if (previo.reservaId !== e.reservaId) throw new ErrorTransporte("Un traslado no cambia de reserva: crea uno nuevo.");
    if (previo.ingresoId && previo.precioCentavos !== e.precioCentavos) throw new ErrorTransporte("Ya se registró el cobro: anúlalo antes de cambiar el precio.");
  }
  await validarRecursos(tx, e, id);
  const datos = {
    tipo: e.tipo, fecha: aDate(e.fecha), horaMin: e.horaMin, duracionMin: e.duracionMin, origen: e.origen.trim(), destino: e.destino.trim(), pax: e.pax,
    unidadId: e.unidadId || null, choferId: e.choferId || null, precioCentavos: e.precioCentavos, notas: e.notas?.trim() || null,
  };
  return id ? tx.traslado.update({ where: { id }, data: datos }) : tx.traslado.create({ data: { tenantId, reservaId: e.reservaId, ...datos, creadoPorId: e.usuarioId } });
}

export async function cambiarEstado(tx: Tx, id: string, estado: "PROGRAMADO" | "COMPLETADO" | "CANCELADO") {
  const t = await tx.traslado.findUnique({ where: { id } });
  if (!t) throw new ErrorTransporte("El traslado no existe.");
  if (t.estado === estado) return t;
  if (estado === "CANCELADO" && t.ingresoId) throw new ErrorTransporte("Ya se registró el cobro: anúlalo antes de cancelar el traslado.");
  if (t.estado === "CANCELADO" && estado === "PROGRAMADO") {
    // Reprogramar un traslado cancelado vuelve a ocupar su unidad y chofer: debe seguir libre
    await validarRecursos(tx, { reservaId: t.reservaId, tipo: t.tipo, fecha: aIso(t.fecha), horaMin: t.horaMin, duracionMin: t.duracionMin, origen: t.origen, destino: t.destino, pax: t.pax, unidadId: t.unidadId, choferId: t.choferId, precioCentavos: t.precioCentavos }, t.id);
  }
  return tx.traslado.update({ where: { id }, data: { estado } });
}

// ─── cobro y gastos ──────────────────────────────────────────────────────────

/** Cobra el traslado: crea el ingreso en una cuenta de la moneda de la empresa. No toca el total de la reserva ni sus comisiones. */
export async function registrarCobro(tx: Tx, tenantId: string, id: string, e: { cuentaId: string; fecha: string; categoriaId?: string | null; usuarioId?: string }) {
  const t = await tx.traslado.findUnique({ where: { id }, include: { reserva: { include: { cliente: true } } } });
  if (!t) throw new ErrorTransporte("El traslado no existe.");
  if (t.estado === "CANCELADO") throw new ErrorTransporte("El traslado está cancelado.");
  if (t.ingresoId) throw new ErrorTransporte("Este traslado ya está cobrado.");
  if (t.precioCentavos <= 0) throw new ErrorTransporte("El traslado no tiene precio: edítalo primero.");
  const empresa = await tx.tenant.findUnique({ where: { id: tenantId }, select: { moneda: true } });
  const cuenta = await tx.cuenta.findUnique({ where: { id: e.cuentaId } });
  if (!cuenta) throw new ErrorTransporte("La cuenta no existe.");
  if (cuenta.moneda !== empresa?.moneda) throw new ErrorTransporte(`El precio está en ${empresa?.moneda}: elige una cuenta en esa moneda.`);
  const ingreso = await registrarIngreso(tx, tenantId, {
    concepto: `Traslado · Reserva #${t.reserva.folio} · ${t.reserva.cliente.nombre}`, cuentaId: e.cuentaId, fecha: e.fecha, montoCentavos: t.precioCentavos,
    categoriaId: e.categoriaId, reservaId: t.reservaId, usuarioId: e.usuarioId,
  });
  await tx.ingreso.update({ where: { id: ingreso.id }, data: { origen: "TRANSPORTE" } });
  return tx.traslado.update({ where: { id }, data: { ingresoId: ingreso.id } });
}

export async function anularCobro(tx: Tx, id: string, usuarioId?: string) {
  const t = await tx.traslado.findUnique({ where: { id } });
  if (!t) throw new ErrorTransporte("El traslado no existe.");
  if (!t.ingresoId) throw new ErrorTransporte("Este traslado no tiene cobro registrado.");
  await cancelarIngresoDeTraslado(tx, t.ingresoId, usuarioId);
  return tx.traslado.update({ where: { id }, data: { ingresoId: null } });
}

/** Gasto del traslado (gasolina, casetas, pago a un transportista). Cuenta contra su rentabilidad y se maneja desde Gastos. */
export async function registrarGastoDeTraslado(tx: Tx, tenantId: string, id: string, e: { concepto: string; cuentaId: string; fecha: string; montoCentavos: number; categoriaId?: string | null; proveedor?: string; usuarioId?: string }) {
  const t = await tx.traslado.findUnique({ where: { id }, select: { id: true, reservaId: true } });
  if (!t) throw new ErrorTransporte("El traslado no existe.");
  return registrarGasto(tx, tenantId, { ...e, trasladoId: t.id, reservaId: t.reservaId });
}

// ─── consultas ───────────────────────────────────────────────────────────────

const INCLUIR = { reserva: { include: { cliente: true, embarcacion: true } }, unidad: true, chofer: true } as const;

export const trasladosDelDia = (tx: Tx, fecha: string) =>
  tx.traslado.findMany({ where: { fecha: aDate(fecha) }, orderBy: [{ horaMin: "asc" }, { creadoEn: "asc" }], include: INCLUIR });

export const trasladosDeReserva = (tx: Tx, reservaId: string) =>
  tx.traslado.findMany({ where: { reservaId }, orderBy: [{ fecha: "asc" }, { horaMin: "asc" }], include: { unidad: true, chofer: true } });

/** Traslados de un chofer desde `desde` durante `dias` días (sin los cancelados). */
export async function misTraslados(tx: Tx, empleadoId: string, desde: string, dias: number) {
  const hasta = aIso(new Date(aDate(desde).getTime() + (dias - 1) * 86_400_000));
  return tx.traslado.findMany({ where: { choferId: empleadoId, estado: { not: "CANCELADO" }, fecha: { gte: aDate(desde), lte: aDate(hasta) } }, orderBy: [{ fecha: "asc" }, { horaMin: "asc" }], include: INCLUIR });
}

/** Rentabilidad de un traslado: precio menos los gastos registrados contra él. */
export async function resumenTraslado(tx: Tx, id: string) {
  const t = await tx.traslado.findUnique({ where: { id }, include: { ...INCLUIR, ingreso: true } });
  if (!t) return null;
  const gastos = await tx.gasto.findMany({ where: { trasladoId: id, estado: "ACTIVO" }, orderBy: { fecha: "asc" }, include: { categoria: true } });
  const gastosCentavos = gastos.reduce((s, g) => s + g.montoBaseCentavos, 0);
  return { traslado: t, gastos, gastosCentavos, resultadoCentavos: t.precioCentavos - gastosCentavos };
}
