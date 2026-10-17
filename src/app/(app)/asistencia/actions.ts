"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { esIso } from "@/lib/fechas";
import { ErrorAsistencia, fijarDia, registrarChecada } from "@/lib/asistencia/servicio";
import type { EstadoForm } from "@/components/formulario";

const coords = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  precisionM: z.number().min(0).max(100_000).nullable(),
});

/** Checada desde el celular. La persona se identifica por su sesión: solo puede checar a sí misma. */
export async function checarAccion(entrada: { lat: number; lng: number; precisionM: number | null }): Promise<EstadoForm> {
  const s = await requireModulo("asistencia", "asistencia:checar");
  const p = coords.safeParse(entrada);
  if (!p.success) return { error: "Ubicación inválida." };
  try {
    const r = await withTenant(s.tenantId, async (tx) => {
      const emp = await tx.empleado.findFirst({ where: { usuarioId: s.usuarioId }, select: { id: true } });
      if (!emp) throw new ErrorAsistencia("Tu usuario no está ligado a un empleado. Pídele a un administrador que lo vincule.");
      return registrarChecada(tx, s.tenantId, { empleadoId: emp.id, ...p.data, zona: s.zonaHoraria });
    });
    revalidatePath("/asistencia");
    return { ok: `${r.tipo === "ENTRADA" ? "Entrada" : "Salida"} registrada en ${r.ubicacion} (a ${r.distanciaM} m).` };
  } catch (e) {
    if (e instanceof ErrorAsistencia) return { error: e.message };
    throw e;
  }
}

const diaSchema = z.object({ estado: z.enum(["", "TRABAJO", "DESCANSO", "VACACIONES", "INCAPACIDAD", "PERMISO", "FALTA"]), nota: z.string().trim().max(300).optional() });

export async function fijarDiaAccion(empleadoId: string, fecha: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("asistencia", "asistencia:administrar");
  const p = diaSchema.safeParse(Object.fromEntries(fd));
  if (!p.success || !esIso(fecha)) return { error: "Datos inválidos." };
  try {
    await withTenant(s.tenantId, (tx) => fijarDia(tx, s.tenantId, { empleadoId, fecha, estado: p.data.estado || null, nota: p.data.nota, usuarioId: s.usuarioId }));
  } catch (e) {
    if (e instanceof ErrorAsistencia) return { error: e.message };
    throw e;
  }
  revalidatePath("/asistencia", "layout");
  revalidatePath("/nomina", "layout");
  return { ok: p.data.estado ? "Día corregido." : "Corrección quitada." };
}

const ubicacionSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(80),
  lat: z.coerce.number().min(-90, "Latitud inválida").max(90, "Latitud inválida"),
  lng: z.coerce.number().min(-180, "Longitud inválida").max(180, "Longitud inválida"),
  radioMetros: z.coerce.number().int().min(20, "Radio mínimo 20 m").max(2000, "Radio máximo 2,000 m"),
});

export async function guardarUbicacion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("asistencia", "asistencia:administrar");
  const p = ubicacionSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  await withTenant(s.tenantId, (tx) => tx.ubicacionAsistencia.create({ data: { ...p.data, tenantId: s.tenantId } }));
  revalidatePath("/asistencia/ubicaciones");
  return { ok: "Ubicación agregada." };
}

export async function alternarUbicacion(id: string) {
  const s = await requireModulo("asistencia", "asistencia:administrar");
  await withTenant(s.tenantId, async (tx) => {
    const u = await tx.ubicacionAsistencia.findUnique({ where: { id } });
    if (u) await tx.ubicacionAsistencia.update({ where: { id }, data: { activa: !u.activa } });
  });
  revalidatePath("/asistencia/ubicaciones");
}

export async function eliminarUbicacion(id: string) {
  const s = await requireModulo("asistencia", "asistencia:administrar");
  // Las checadas ya hechas conservan su registro (la ubicación queda en null)
  await withTenant(s.tenantId, (tx) => tx.ubicacionAsistencia.deleteMany({ where: { id } }));
  revalidatePath("/asistencia/ubicaciones");
}
