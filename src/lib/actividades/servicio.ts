import type { MetodoPago, OrigenReserva } from "@prisma/client";
import { siguienteFolio, type Tx } from "@/lib/db/tenant";
import { aDate, aIso, esIso, sumarDias } from "@/lib/fechas";
import { cancelarIngresoDePagoActividad, ingresoDePagoActividad } from "@/lib/finanzas/servicio";
import { enBloqueo, hayConflicto, minutosAHora } from "@/lib/reservas/disponibilidad";
import { cobro, errorDeActividad, errorDePago, errorDeReserva, errorDeSalida, finDeSalida, lugaresLibres, lugaresOcupados, totalDeReserva } from "./reglas";

export class ErrorActividades extends Error {}

// ─── actividades (catálogo) ──────────────────────────────────────────────────

export type EntradaActividad = {
  nombre: string; descripcion?: string; duracionMin: number; precioCentavos: number; cupo: number; color?: string; puntoEncuentro?: string; notas?: string; activa?: boolean;
};

export async function guardarActividad(tx: Tx, tenantId: string, id: string | null, e: EntradaActividad) {
  const nombre = e.nombre.trim();
  const err = errorDeActividad({ ...e, nombre });
  if (err) throw new ErrorActividades(err);
  if (e.color && !/^#[0-9a-fA-F]{6}$/.test(e.color)) throw new ErrorActividades("Color inválido.");
  if (await tx.actividad.findFirst({ where: { nombre, ...(id ? { id: { not: id } } : {}) }, select: { id: true } })) throw new ErrorActividades("Ya tienes una actividad con ese nombre.");
  const datos = {
    nombre, descripcion: e.descripcion?.trim() || null, duracionMin: e.duracionMin, precioCentavos: e.precioCentavos, cupo: e.cupo,
    puntoEncuentro: e.puntoEncuentro?.trim() || null, notas: e.notas?.trim() || null, ...(e.color ? { color: e.color } : {}),
  };
  if (id) {
    if (!(await tx.actividad.findUnique({ where: { id }, select: { id: true } }))) throw new ErrorActividades("La actividad no existe.");
    return tx.actividad.update({ where: { id }, data: { ...datos, ...(e.activa === undefined ? {} : { activa: e.activa }) } });
  }
  return tx.actividad.create({ data: { tenantId, ...datos } });
}

// ─── salidas ─────────────────────────────────────────────────────────────────

type Recursos = { fecha: string; inicioMin: number; finMin: number; cupo: number; embarcacionId?: string | null; guiaId?: string | null };

/** Valida embarcación y guía: que existan, estén activos y no se empalmen con reservas, bloqueos u otras salidas. */
async function validarRecursos(tx: Tx, r: Recursos, excluirSalidaId: string | null) {
  if (r.embarcacionId) {
    // Mismo candado que las reservas de embarcación: una renta y una actividad no pueden tomar el mismo barco a la vez
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${r.embarcacionId + r.fecha}, 0))`;
    const emb = await tx.embarcacion.findUnique({ where: { id: r.embarcacionId } });
    if (!emb) throw new ErrorActividades("La embarcación no existe.");
    if (emb.estado !== "ACTIVA") throw new ErrorActividades(`${emb.nombre} no está activa (${emb.estado.toLowerCase()}).`);
    if (r.cupo > emb.capacidad) throw new ErrorActividades(`${emb.nombre} admite máximo ${emb.capacidad} pasajeros y el cupo es de ${r.cupo}.`);
    const bloqueos = await tx.bloqueoEmbarcacion.findMany({ where: { embarcacionId: emb.id, desde: { lte: aDate(r.fecha) }, hasta: { gte: aDate(r.fecha) } } });
    const b = bloqueos.find((x) => enBloqueo(r.fecha, { desde: aIso(x.desde), hasta: aIso(x.hasta) }));
    if (b) throw new ErrorActividades(`${emb.nombre} está bloqueada esa fecha: ${b.motivo}.`);
    const reservas = await tx.reserva.findMany({ where: { embarcacionId: emb.id, fecha: aDate(r.fecha), estado: { not: "CANCELADA" } }, select: { inicioMin: true, finMin: true } });
    const rc = reservas.find((x) => hayConflicto(r, [x]));
    if (rc) throw new ErrorActividades(`${emb.nombre} ya tiene una reserva de ${minutosAHora(rc.inicioMin)} a ${minutosAHora(rc.finMin)} ese día.`);
    const salidas = await tx.salidaActividad.findMany({
      where: { embarcacionId: emb.id, fecha: aDate(r.fecha), estado: { not: "CANCELADA" }, ...(excluirSalidaId ? { id: { not: excluirSalidaId } } : {}) },
      select: { inicioMin: true, finMin: true, actividad: { select: { nombre: true } } },
    });
    const sc = salidas.find((x) => hayConflicto(r, [x]));
    if (sc) throw new ErrorActividades(`${emb.nombre} ya tiene la actividad «${sc.actividad.nombre}» de ${minutosAHora(sc.inicioMin)} a ${minutosAHora(sc.finMin)} ese día.`);
  }
  if (r.guiaId) {
    const g = await tx.tripulante.findUnique({ where: { id: r.guiaId } });
    if (!g || !g.activo) throw new ErrorActividades("El guía no existe o está inactivo.");
    const otras = await tx.salidaActividad.findMany({
      where: { guiaId: g.id, fecha: aDate(r.fecha), estado: { not: "CANCELADA" }, ...(excluirSalidaId ? { id: { not: excluirSalidaId } } : {}) },
      select: { inicioMin: true, finMin: true },
    });
    const oc = otras.find((x) => hayConflicto(r, [x]));
    if (oc) throw new ErrorActividades(`${g.nombre} ya tiene otra salida de ${minutosAHora(oc.inicioMin)} a ${minutosAHora(oc.finMin)} ese día.`);
  }
}

export type EntradaSalida = { actividadId: string; fecha: string; inicioMin: number; cupo?: number; precioCentavos?: number; embarcacionId?: string | null; guiaId?: string | null; notas?: string };

export async function programarSalida(tx: Tx, tenantId: string, e: EntradaSalida) {
  const act = await tx.actividad.findUnique({ where: { id: e.actividadId } });
  if (!act) throw new ErrorActividades("La actividad no existe.");
  if (!act.activa) throw new ErrorActividades("La actividad está inactiva.");
  const datos = { fecha: e.fecha, inicioMin: e.inicioMin, finMin: finDeSalida(e.inicioMin, act.duracionMin), cupo: e.cupo ?? act.cupo, precioCentavos: e.precioCentavos ?? act.precioCentavos };
  const err = errorDeSalida(datos);
  if (err) throw new ErrorActividades(err);
  await validarRecursos(tx, { ...datos, embarcacionId: e.embarcacionId, guiaId: e.guiaId }, null);
  return tx.salidaActividad.create({
    data: { tenantId, actividadId: act.id, fecha: aDate(e.fecha), inicioMin: datos.inicioMin, finMin: datos.finMin, cupo: datos.cupo, precioCentavos: datos.precioCentavos, embarcacionId: e.embarcacionId || null, guiaId: e.guiaId || null, notas: e.notas?.trim() || null },
  });
}

export type CambiosSalida = { fecha?: string; inicioMin?: number; cupo?: number; precioCentavos?: number; embarcacionId?: string | null; guiaId?: string | null; notas?: string };

export async function editarSalida(tx: Tx, id: string, c: CambiosSalida) {
  const s = await tx.salidaActividad.findUnique({ where: { id }, include: { reservas: { select: { pax: true, estado: true } } } });
  if (!s) throw new ErrorActividades("La salida no existe.");
  if (s.estado !== "PROGRAMADA") throw new ErrorActividades("Solo se edita una salida programada.");
  const duracion = s.finMin - s.inicioMin;
  const fecha = c.fecha ?? aIso(s.fecha), inicioMin = c.inicioMin ?? s.inicioMin;
  const nuevo = { fecha, inicioMin, finMin: inicioMin + duracion, cupo: c.cupo ?? s.cupo, precioCentavos: c.precioCentavos ?? s.precioCentavos };
  const err = errorDeSalida(nuevo);
  if (err) throw new ErrorActividades(err);
  const ocupados = lugaresOcupados(s.reservas);
  if (nuevo.cupo < ocupados) throw new ErrorActividades(`Ya hay ${ocupados} lugares apartados: el cupo no puede ser menor.`);
  const embarcacionId = c.embarcacionId === undefined ? s.embarcacionId : c.embarcacionId || null;
  const guiaId = c.guiaId === undefined ? s.guiaId : c.guiaId || null;
  await validarRecursos(tx, { ...nuevo, embarcacionId, guiaId }, s.id);
  return tx.salidaActividad.update({
    where: { id },
    data: { fecha: aDate(fecha), inicioMin: nuevo.inicioMin, finMin: nuevo.finMin, cupo: nuevo.cupo, precioCentavos: nuevo.precioCentavos, embarcacionId, guiaId, ...(c.notas === undefined ? {} : { notas: c.notas.trim() || null }) },
  });
}

/** Cancelar una salida cancela sus reservas; si alguna ya tiene pagos hay que resolverlos antes. */
export async function cambiarEstadoSalida(tx: Tx, id: string, estado: "COMPLETADA" | "CANCELADA") {
  const s = await tx.salidaActividad.findUnique({ where: { id }, include: { reservas: { include: { pagos: { select: { id: true } } } } } });
  if (!s) throw new ErrorActividades("La salida no existe.");
  if (s.estado === estado) return s;
  if (s.estado !== "PROGRAMADA") throw new ErrorActividades("Solo cambia de estado una salida programada.");
  const vivas = s.reservas.filter((r) => r.estado !== "CANCELADA");
  if (estado === "CANCELADA") {
    if (vivas.some((r) => r.pagos.length > 0)) throw new ErrorActividades("Hay reservas con pagos registrados: elimina los pagos (o devuélvelos) antes de cancelar la salida.");
    await tx.reservaActividad.updateMany({ where: { salidaId: id, estado: { not: "CANCELADA" } }, data: { estado: "CANCELADA" } });
  } else {
    await tx.reservaActividad.updateMany({ where: { salidaId: id, estado: { in: ["PENDIENTE", "CONFIRMADA"] } }, data: { estado: "COMPLETADA" } });
  }
  return tx.salidaActividad.update({ where: { id }, data: { estado } });
}

// ─── reservas por persona ────────────────────────────────────────────────────

export type EntradaReservaActividad = {
  salidaId: string; pax: number; clienteId?: string | null; cliente?: { nombre: string; telefono?: string; email?: string };
  origen?: OrigenReserva; notas?: string; creadorId?: string;
};

const bloquearSalida = (tx: Tx, salidaId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"salida:" + salidaId}, 0))`;

export async function reservarActividad(tx: Tx, tenantId: string, e: EntradaReservaActividad) {
  await bloquearSalida(tx, e.salidaId); // dos reservas simultáneas no pueden pasarse del cupo
  const s = await tx.salidaActividad.findUnique({ where: { id: e.salidaId }, include: { reservas: { select: { pax: true, estado: true } } } });
  if (!s) throw new ErrorActividades("La salida no existe.");
  const err = errorDeReserva(e.pax, lugaresLibres(s.cupo, s.reservas), s.estado);
  if (err) throw new ErrorActividades(err);
  let clienteId = e.clienteId || null;
  if (clienteId) {
    if (!(await tx.cliente.findUnique({ where: { id: clienteId }, select: { id: true } }))) throw new ErrorActividades("El cliente no existe.");
  } else {
    const nombre = e.cliente?.nombre.trim() ?? "";
    if (nombre.length < 2) throw new ErrorActividades("Elige un cliente o escribe su nombre.");
    clienteId = (await tx.cliente.create({ data: { tenantId, nombre, telefono: e.cliente?.telefono?.trim() || null, email: e.cliente?.email?.trim() || null } })).id;
  }
  const folio = await siguienteFolio(tx, tenantId);
  return tx.reservaActividad.create({
    data: {
      tenantId, folio, salidaId: s.id, clienteId, pax: e.pax, precioUnitarioCentavos: s.precioCentavos, totalCentavos: totalDeReserva(e.pax, s.precioCentavos),
      estado: "CONFIRMADA", origen: e.origen ?? "DIRECTO", notas: e.notas?.trim() || null, creadorId: e.creadorId,
    },
  });
}

export async function cambiarPaxReserva(tx: Tx, id: string, pax: number) {
  const r0 = await tx.reservaActividad.findUnique({ where: { id }, select: { salidaId: true } });
  if (!r0) throw new ErrorActividades("La reserva no existe.");
  await bloquearSalida(tx, r0.salidaId);
  const r = await tx.reservaActividad.findUnique({ where: { id }, include: { pagos: { select: { montoCentavos: true } }, salida: { include: { reservas: { select: { id: true, pax: true, estado: true } } } } } });
  if (!r) throw new ErrorActividades("La reserva no existe.");
  if (r.estado === "CANCELADA" || r.estado === "COMPLETADA") throw new ErrorActividades("Solo se edita una reserva vigente.");
  const err = errorDeReserva(pax, lugaresLibres(r.salida.cupo, r.salida.reservas.filter((x) => x.id !== r.id)), r.salida.estado);
  if (err) throw new ErrorActividades(err);
  const total = totalDeReserva(pax, r.precioUnitarioCentavos);
  const pagado = r.pagos.reduce((a, p) => a + p.montoCentavos, 0);
  if (total < pagado) throw new ErrorActividades("El nuevo total es menor a lo ya pagado: ajusta primero los pagos.");
  return tx.reservaActividad.update({ where: { id }, data: { pax, totalCentavos: total } });
}

export async function cancelarReservaActividad(tx: Tx, id: string) {
  const r = await tx.reservaActividad.findUnique({ where: { id }, include: { pagos: { select: { id: true } } } });
  if (!r) throw new ErrorActividades("La reserva no existe.");
  if (r.estado === "CANCELADA") return r;
  if (r.estado === "COMPLETADA") throw new ErrorActividades("La reserva ya se realizó.");
  if (r.pagos.length > 0) throw new ErrorActividades("La reserva tiene pagos registrados: elimínalos antes de cancelarla.");
  return tx.reservaActividad.update({ where: { id }, data: { estado: "CANCELADA" } });
}

// ─── cobros ──────────────────────────────────────────────────────────────────

export type EntradaPagoActividad = { reservaId: string; montoCentavos: number; metodo: MetodoPago; referencia?: string; cuentaId?: string | null };

/** Registra el pago y su ingreso. `ingresoCreado` es false si no hay una cuenta configurada para ese método (el pago queda sin ingreso). */
export async function registrarPagoActividad(tx: Tx, tenantId: string, e: EntradaPagoActividad) {
  const r = await tx.reservaActividad.findUnique({ where: { id: e.reservaId }, include: { pagos: { select: { montoCentavos: true } } } });
  if (!r) throw new ErrorActividades("La reserva no existe.");
  if (r.estado === "CANCELADA") throw new ErrorActividades("La reserva está cancelada.");
  const err = errorDePago(e.montoCentavos, r.totalCentavos, r.pagos.reduce((a, p) => a + p.montoCentavos, 0));
  if (err) throw new ErrorActividades(err);
  const pago = await tx.pagoActividad.create({ data: { tenantId, reservaActividadId: r.id, montoCentavos: e.montoCentavos, metodo: e.metodo, referencia: e.referencia?.trim() || null } });
  const ingreso = await ingresoDePagoActividad(tx, tenantId, pago.id, e.cuentaId);
  return { pago, ingresoCreado: ingreso !== null };
}

export async function eliminarPagoActividad(tx: Tx, id: string, usuarioId?: string) {
  const p = await tx.pagoActividad.findUnique({ where: { id } });
  if (!p) throw new ErrorActividades("El pago no existe.");
  await cancelarIngresoDePagoActividad(tx, id, usuarioId);
  await tx.pagoActividad.delete({ where: { id } });
}

// ─── consultas ───────────────────────────────────────────────────────────────

const INCLUIR_SALIDA = { actividad: true, embarcacion: true, guia: true, reservas: { select: { pax: true, estado: true } } } as const;

/** Salidas de un rango de días (para la agenda), con sus lugares ocupados. */
export async function salidasAgenda(tx: Tx, desde: string, dias: number, opciones: { actividadId?: string; incluirCanceladas?: boolean } = {}) {
  if (!esIso(desde)) throw new ErrorActividades("Fecha inválida.");
  const hasta = sumarDias(desde, dias - 1);
  const filas = await tx.salidaActividad.findMany({
    where: { fecha: { gte: aDate(desde), lte: aDate(hasta) }, ...(opciones.actividadId ? { actividadId: opciones.actividadId } : {}), ...(opciones.incluirCanceladas ? {} : { estado: { not: "CANCELADA" } }) },
    orderBy: [{ fecha: "asc" }, { inicioMin: "asc" }], include: INCLUIR_SALIDA,
  });
  return filas.map((s) => ({ ...s, ocupados: lugaresOcupados(s.reservas), libres: lugaresLibres(s.cupo, s.reservas) }));
}

export async function detalleSalida(tx: Tx, id: string) {
  const s = await tx.salidaActividad.findUnique({
    where: { id },
    include: { actividad: true, embarcacion: true, guia: true, reservas: { orderBy: { creadoEn: "asc" }, include: { cliente: true, pagos: { orderBy: { pagadoEn: "asc" } } } } },
  });
  if (!s) return null;
  const reservas = s.reservas.map((r) => {
    const pagado = r.pagos.reduce((a, p) => a + p.montoCentavos, 0);
    return { ...r, pagado, cobro: cobro(r.totalCentavos, pagado) };
  });
  return { ...s, reservas, ocupados: lugaresOcupados(s.reservas), libres: lugaresLibres(s.cupo, s.reservas) };
}
