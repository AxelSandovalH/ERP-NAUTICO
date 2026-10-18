"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { ErrorHorarios, asignar, copiarSemana, crearPersona, guardarPlantilla, publicarSemana, vincularUsuario } from "@/lib/horarios/servicio";
import { horaAMinutos } from "@/lib/horarios/semana";
import type { EstadoForm } from "@/components/formulario";

const admin = () => requireModulo("horarios", "horarios:administrar");
const refrescar = () => revalidatePath("/horarios", "layout");

async function conErrores<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try { return await fn(); } catch (e) {
    if (e instanceof ErrorHorarios) return { error: e.message };
    throw e;
  }
}

/** Cambia lo que hace una persona un día (desde la cuadrícula). */
export async function asignarAccion(empleadoId: string, fecha: string, valor: string) {
  const s = await admin();
  const r = await conErrores(() => withTenant(s.tenantId, (tx) => asignar(tx, s.tenantId, { empleadoId, fecha, valor, usuarioId: s.usuarioId })));
  if (r && "error" in r) return r;
  refrescar();
  return { ok: true };
}

export async function copiarSemanaAccion(desdeLunes: string, aLunes: string) {
  const s = await admin();
  const r = await conErrores(() => withTenant(s.tenantId, (tx) => copiarSemana(tx, s.tenantId, desdeLunes, aLunes, s.usuarioId)));
  if ("error" in r) return r;
  refrescar();
  return { ok: true, mensaje: `${r.copiados} copiados${r.omitidos ? `, ${r.omitidos} ya tenían algo asignado` : ""}.` };
}

export async function publicarAccion(lunes: string, publicar: boolean) {
  const s = await admin();
  const r = await conErrores(() => withTenant(s.tenantId, (tx) => publicarSemana(tx, s.tenantId, lunes, publicar, s.usuarioId)));
  if (r && typeof r === "object" && "error" in r) return r;
  refrescar();
  return { ok: true };
}

const plantillaSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre del turno").max(40),
  entrada: z.string().min(1, "Indica la hora de entrada"),
  salida: z.string().min(1, "Indica la hora de salida"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
});

export async function guardarPlantillaAccion(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = plantillaSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const inicioMin = horaAMinutos(p.data.entrada), finMin = horaAMinutos(p.data.salida);
  if (inicioMin === null || finMin === null) return { error: "Horas inválidas." };
  const r = await conErrores(() => withTenant(s.tenantId, (tx) => guardarPlantilla(tx, s.tenantId, id, { nombre: p.data.nombre, inicioMin, finMin, color: p.data.color })));
  if (r && "error" in r) return r;
  refrescar();
  return { ok: id ? "Turno actualizado (no cambia lo ya asignado)." : "Turno creado." };
}

export async function alternarPlantillaAccion(id: string, activa: boolean) {
  const s = await admin();
  await withTenant(s.tenantId, (tx) => tx.plantillaTurno.update({ where: { id }, data: { activa } }));
  refrescar();
}

const personaSchema = z.object({ nombre: z.string().trim().min(2, "Escribe el nombre").max(80), apellido: z.string().trim().max(80).optional(), puesto: z.string().trim().max(80).optional(), usuarioId: z.string().optional() });

export async function crearPersonaAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = personaSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const r = await conErrores(() => withTenant(s.tenantId, (tx) => crearPersona(tx, s.tenantId, { ...p.data, usuarioId: p.data.usuarioId || null })));
  if ("error" in r) return r;
  refrescar();
  return { ok: "Persona agregada." };
}

export async function vincularUsuarioAccion(empleadoId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const usuarioId = String(fd.get("usuarioId") ?? "") || null;
  const r = await conErrores(() => withTenant(s.tenantId, (tx) => vincularUsuario(tx, s.tenantId, empleadoId, usuarioId)));
  if ("error" in r) return r;
  refrescar();
  return { ok: usuarioId ? "Usuario vinculado." : "Vínculo quitado." };
}

export async function alternarPersonaAccion(id: string, activo: boolean) {
  const s = await admin();
  await withTenant(s.tenantId, (tx) => tx.empleado.update({ where: { id }, data: { activo } }));
  refrescar();
}
