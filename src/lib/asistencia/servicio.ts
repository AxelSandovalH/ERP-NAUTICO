import type { EstadoDia } from "@prisma/client";
import type { Tx } from "@/lib/db/tenant";
import { aDate, diaLocal } from "@/lib/fechas";
import { evaluarChecada, siguienteTipo } from "./geocerca";

export class ErrorAsistencia extends Error {}

/** Segundos mínimos entre dos checadas de la misma persona (evita el doble toque). */
export const ENFRIAMIENTO_S = 60;

export type ResultadoChecada = { tipo: "ENTRADA" | "SALIDA"; ubicacion: string; distanciaM: number; fecha: Date };

/** Registra una checada si la persona está dentro de alguna geocerca activa. Alterna
 *  entrada/salida según lo que ya hizo hoy (día local del negocio). */
export async function registrarChecada(
  tx: Tx, tenantId: string,
  e: { empleadoId: string; lat: number; lng: number; precisionM: number | null; zona: string; ahora?: Date },
): Promise<ResultadoChecada> {
  const ahora = e.ahora ?? new Date();
  const dia = diaLocal(ahora, e.zona);
  // Dos toques simultáneos del mismo empleado no deben crear dos checadas
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"checada" + e.empleadoId}, 0))`;

  const emp = await tx.empleado.findUnique({ where: { id: e.empleadoId }, select: { activo: true } });
  if (!emp) throw new ErrorAsistencia("El empleado no existe.");
  if (!emp.activo) throw new ErrorAsistencia("El empleado está inactivo.");

  const ubicaciones = await tx.ubicacionAsistencia.findMany({ where: { activa: true } });
  const ev = evaluarChecada(e.lat, e.lng, e.precisionM, ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre, lat: u.lat, lng: u.lng, radioMetros: u.radioMetros })));
  if (!ev.ok) {
    if (ev.motivo === "sin_ubicaciones") throw new ErrorAsistencia("Aún no hay ubicaciones de asistencia configuradas. Pídele a un administrador que agregue una.");
    if (ev.motivo === "gps_debil") throw new ErrorAsistencia("La señal de GPS es muy imprecisa. Sal a un lugar abierto e inténtalo de nuevo.");
    throw new ErrorAsistencia(`Estás a ${ev.distanciaM} m de ${ev.cercana!.nombre} (el radio permitido es ${ev.cercana!.radioMetros} m).`);
  }

  const delDia = await tx.checada.findMany({ where: { empleadoId: e.empleadoId, dia: aDate(dia) }, orderBy: { fecha: "asc" } });
  const ultima = delDia[delDia.length - 1];
  if (ultima && (ahora.getTime() - ultima.fecha.getTime()) / 1000 < ENFRIAMIENTO_S)
    throw new ErrorAsistencia("Ya checaste hace un momento. Espera un minuto antes de volver a checar.");

  const tipo = siguienteTipo(ultima?.tipo ?? null);
  const c = await tx.checada.create({
    data: {
      tenantId, empleadoId: e.empleadoId, tipo, fecha: ahora, dia: aDate(dia), ubicacionId: ev.ubicacion.id,
      lat: e.lat, lng: e.lng, distanciaM: ev.distanciaM, precisionM: e.precisionM == null ? null : Math.round(e.precisionM),
    },
  });
  return { tipo, ubicacion: ev.ubicacion.nombre, distanciaM: ev.distanciaM, fecha: c.fecha };
}

/** Corrige el estado de un día (manda sobre las checadas). `estado = null` quita la corrección. */
export async function fijarDia(
  tx: Tx, tenantId: string,
  e: { empleadoId: string; fecha: string; estado: EstadoDia | null; nota?: string; usuarioId: string },
) {
  if (!(await tx.empleado.findUnique({ where: { id: e.empleadoId }, select: { id: true } }))) throw new ErrorAsistencia("El empleado no existe.");
  if (e.estado === null) {
    await tx.diaAsistencia.deleteMany({ where: { empleadoId: e.empleadoId, fecha: aDate(e.fecha) } });
    return;
  }
  const datos = { estado: e.estado, nota: e.nota || null, resueltoPorId: e.usuarioId };
  await tx.diaAsistencia.upsert({
    where: { empleadoId_fecha: { empleadoId: e.empleadoId, fecha: aDate(e.fecha) } },
    create: { tenantId, empleadoId: e.empleadoId, fecha: aDate(e.fecha), ...datos },
    update: datos,
  });
}
