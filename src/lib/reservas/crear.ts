import type { OrigenReserva } from "@prisma/client";
import { siguienteFolio, type Tx } from "@/lib/db/tenant";
import { aDate, aIso } from "@/lib/fechas";
import { enBloqueo, hayConflicto, minutosAHora, rangoValido } from "./disponibilidad";

export type EntradaReserva = {
  tenantId: string;
  embarcacionId: string;
  clienteId: string;
  tarifaId?: string | null;
  fecha: string; // YYYY-MM-DD
  inicioMin: number;
  finMin: number;
  pax: number;
  origen: OrigenReserva;
  totalCentavos: number;
  notas?: string;
  creadorId?: string;
  /** Al editar: se ignora la propia reserva al buscar traslapes. */
  ignorarReservaId?: string;
};

export class ErrorReserva extends Error {}

/** Valida disponibilidad dentro de la transacción. Toma un advisory lock por
 *  (embarcación, fecha) para que dos reservas simultáneas no se traslapen. */
export async function validarDisponibilidad(tx: Tx, e: EntradaReserva) {
  if (!rangoValido(e)) throw new ErrorReserva("El horario es inválido: la hora final debe ser posterior a la inicial.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${e.embarcacionId + e.fecha}, 0))`;

  const emb = await tx.embarcacion.findUnique({ where: { id: e.embarcacionId } });
  if (!emb) throw new ErrorReserva("La embarcación no existe.");
  if (emb.estado !== "ACTIVA") throw new ErrorReserva(`${emb.nombre} no está activa (${emb.estado.toLowerCase()}).`);
  if (e.pax < 1) throw new ErrorReserva("Indica al menos 1 pasajero.");
  if (e.pax > emb.capacidad) throw new ErrorReserva(`${emb.nombre} admite máximo ${emb.capacidad} pasajeros.`);

  const bloqueos = await tx.bloqueoEmbarcacion.findMany({
    where: { embarcacionId: e.embarcacionId, desde: { lte: aDate(e.fecha) }, hasta: { gte: aDate(e.fecha) } },
  });
  const b = bloqueos.find((x) => enBloqueo(e.fecha, { desde: aIso(x.desde), hasta: aIso(x.hasta) }));
  if (b) throw new ErrorReserva(`${emb.nombre} está bloqueada esa fecha: ${b.motivo}.`);

  const delDia = await tx.reserva.findMany({
    where: {
      embarcacionId: e.embarcacionId, fecha: aDate(e.fecha), estado: { not: "CANCELADA" },
      ...(e.ignorarReservaId ? { id: { not: e.ignorarReservaId } } : {}),
    },
    select: { inicioMin: true, finMin: true },
  });
  if (hayConflicto(e, delDia)) {
    const c = delDia.find((r) => e.inicioMin < r.finMin && r.inicioMin < e.finMin)!;
    throw new ErrorReserva(`${emb.nombre} ya tiene una reserva de ${minutosAHora(c.inicioMin)} a ${minutosAHora(c.finMin)} ese día.`);
  }
}

export async function crearReservaTx(tx: Tx, e: EntradaReserva) {
  await validarDisponibilidad(tx, e);
  const folio = await siguienteFolio(tx, e.tenantId);
  return tx.reserva.create({
    data: {
      tenantId: e.tenantId, folio, embarcacionId: e.embarcacionId, clienteId: e.clienteId,
      tarifaId: e.tarifaId ?? null, fecha: aDate(e.fecha), inicioMin: e.inicioMin, finMin: e.finMin,
      pax: e.pax, origen: e.origen, totalCentavos: e.totalCentavos, notas: e.notas || null,
      creadorId: e.creadorId, estado: "PENDIENTE",
    },
  });
}
