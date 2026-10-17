import type { RolTripulante } from "@prisma/client";
import type { Tx } from "@/lib/db/tenant";
import { aIso } from "@/lib/fechas";
import { seTraslapan } from "@/lib/reservas/disponibilidad";
import { hhmm } from "@/lib/calendario/mapear";

export class ErrorTripulacion extends Error {}

/** Por defecto el tripulante se presenta 2 horas antes de la salida. */
export function horaLlegadaPorDefecto(inicioMin: number): string {
  return hhmm(Math.max(0, inicioMin - 120));
}

export async function asignarTripulanteTx(
  tx: Tx, tenantId: string,
  e: { reservaId: string; tripulanteId: string; rol: RolTripulante; horaLlegada?: string | null },
) {
  const r = await tx.reserva.findUnique({ where: { id: e.reservaId } });
  if (!r) throw new ErrorTripulacion("La reserva no existe.");
  if (r.estado === "CANCELADA") throw new ErrorTripulacion("No se puede asignar tripulación a una reserva cancelada.");
  const t = await tx.tripulante.findUnique({ where: { id: e.tripulanteId } });
  if (!t) throw new ErrorTripulacion("El tripulante no existe.");
  if (!t.activo) throw new ErrorTripulacion(`${t.nombre} no está activo.`);

  // Dos asignaciones simultáneas del mismo tripulante el mismo día no deben chocar
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"trip" + e.tripulanteId + aIso(r.fecha)}, 0))`;

  if (await tx.reservaTripulante.findUnique({ where: { reservaId_tripulanteId: { reservaId: e.reservaId, tripulanteId: e.tripulanteId } } }))
    throw new ErrorTripulacion(`${t.nombre} ya está asignado a esta reserva.`);

  const delDia = await tx.reservaTripulante.findMany({
    where: { tripulanteId: e.tripulanteId, reserva: { fecha: r.fecha, estado: { not: "CANCELADA" }, id: { not: r.id } } },
    include: { reserva: { select: { folio: true, inicioMin: true, finMin: true } } },
  });
  const choque = delDia.find((a) => seTraslapan({ inicioMin: r.inicioMin, finMin: r.finMin }, a.reserva));
  if (choque)
    throw new ErrorTripulacion(`${t.nombre} ya está en la reserva #${choque.reserva.folio} de ${hhmm(choque.reserva.inicioMin)} a ${hhmm(choque.reserva.finMin)} ese día.`);

  return tx.reservaTripulante.create({
    data: { tenantId, reservaId: e.reservaId, tripulanteId: e.tripulanteId, rol: e.rol, horaLlegada: e.horaLlegada || horaLlegadaPorDefecto(r.inicioMin) },
  });
}
