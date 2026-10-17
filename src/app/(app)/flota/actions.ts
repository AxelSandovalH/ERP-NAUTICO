"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, esIso, pesosACentavos } from "@/lib/fechas";
import type { EstadoForm } from "@/components/formulario";

const embarcacionSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(80),
  tipo: z.enum(["YATE", "CATAMARAN", "VELERO", "LANCHA", "MOTO_ACUATICA", "PANGA"]),
  capacidad: z.coerce.number().int().min(1, "Capacidad mínima 1").max(500),
  esloraPies: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).max(500).optional()),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
  estado: z.enum(["ACTIVA", "MANTENIMIENTO", "INACTIVA"]).default("ACTIVA"),
  notas: z.string().trim().max(2000).optional(),
  precioCasa: z.string().optional(),
  paxIncluidosCasa: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).max(500).optional()),
  extraPaxCasa: z.string().optional(),
});

/** Separa el precio casa (que viene en pesos) del resto de campos y lo pasa a centavos. */
function datosEmbarcacion(d: z.infer<typeof embarcacionSchema>) {
  const { precioCasa, extraPaxCasa, paxIncluidosCasa, ...resto } = d;
  const aCentavos = (t?: string) => (t && t.trim() ? pesosACentavos(t) : null);
  return { ...resto, precioCasaCentavos: aCentavos(precioCasa), paxIncluidosCasa: paxIncluidosCasa ?? null, extraPaxCasaCentavos: aCentavos(extraPaxCasa) };
}

export async function crearEmbarcacion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("flota", "flota:escribir");
  const p = embarcacionSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  let id: string;
  try {
    id = (await withTenant(s.tenantId, (tx) =>
      tx.embarcacion.create({ data: { ...datosEmbarcacion(p.data), tenantId: s.tenantId } }))).id;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "Ya tienes una embarcación con ese nombre." };
    throw e;
  }
  revalidatePath("/flota");
  redirect(`/flota/${id}`);
}

export async function actualizarEmbarcacion(id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("flota", "flota:escribir");
  const p = embarcacionSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  try {
    const r = await withTenant(s.tenantId, (tx) => tx.embarcacion.updateMany({ where: { id }, data: datosEmbarcacion(p.data) }));
    if (r.count === 0) return { error: "Embarcación no encontrada." };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "Ya tienes una embarcación con ese nombre." };
    throw e;
  }
  revalidatePath("/flota");
  revalidatePath(`/flota/${id}`);
  return { ok: "Cambios guardados." };
}

const tarifaSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre de la tarifa").max(80),
  horas: z.coerce.number().min(0.5, "Mínimo media hora").max(24),
  precio: z.string().min(1, "Escribe el precio"),
});

export async function crearTarifa(embarcacionId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("flota", "flota:escribir");
  const p = tarifaSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const precioCentavos = pesosACentavos(p.data.precio);
  if (precioCentavos === null) return { error: "Precio inválido." };
  const ok = await withTenant(s.tenantId, async (tx) => {
    if (!(await tx.embarcacion.findUnique({ where: { id: embarcacionId }, select: { id: true } }))) return false;
    await tx.tarifa.create({
      data: { tenantId: s.tenantId, embarcacionId, nombre: p.data.nombre, duracionMin: Math.round(p.data.horas * 60), precioCentavos },
    });
    return true;
  });
  if (!ok) return { error: "Embarcación no encontrada." };
  revalidatePath(`/flota/${embarcacionId}`);
  return { ok: "Tarifa agregada." };
}

export async function eliminarTarifa(embarcacionId: string, tarifaId: string) {
  const s = await requireModulo("flota", "flota:escribir");
  // Las reservas conservan su total; la tarifa se desliga (onDelete: SetNull)
  await withTenant(s.tenantId, (tx) => tx.tarifa.deleteMany({ where: { id: tarifaId, embarcacionId } }));
  revalidatePath(`/flota/${embarcacionId}`);
}

const bloqueoSchema = z.object({ desde: z.string(), hasta: z.string(), motivo: z.string().trim().min(2, "Escribe el motivo").max(200) });

export async function crearBloqueo(embarcacionId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("flota", "flota:escribir");
  const p = bloqueoSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!esIso(p.data.desde) || !esIso(p.data.hasta)) return { error: "Fechas inválidas." };
  if (p.data.hasta < p.data.desde) return { error: "La fecha final no puede ser anterior a la inicial." };
  const ok = await withTenant(s.tenantId, async (tx) => {
    if (!(await tx.embarcacion.findUnique({ where: { id: embarcacionId }, select: { id: true } }))) return false;
    await tx.bloqueoEmbarcacion.create({
      data: { tenantId: s.tenantId, embarcacionId, desde: aDate(p.data.desde), hasta: aDate(p.data.hasta), motivo: p.data.motivo },
    });
    return true;
  });
  if (!ok) return { error: "Embarcación no encontrada." };
  revalidatePath(`/flota/${embarcacionId}`);
  revalidatePath("/calendario");
  return { ok: "Bloqueo agregado." };
}

export async function eliminarBloqueo(embarcacionId: string, bloqueoId: string) {
  const s = await requireModulo("flota", "flota:escribir");
  await withTenant(s.tenantId, (tx) => tx.bloqueoEmbarcacion.deleteMany({ where: { id: bloqueoId, embarcacionId } }));
  revalidatePath(`/flota/${embarcacionId}`);
  revalidatePath("/calendario");
}
