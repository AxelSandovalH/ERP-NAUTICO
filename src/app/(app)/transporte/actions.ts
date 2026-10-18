"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { pesosACentavos } from "@/lib/fechas";
import { ErrorFinanzas } from "@/lib/finanzas/servicio";
import { horaAMinutos } from "@/lib/horarios/semana";
import { ErrorTransporte, anularCobro, cambiarEstado, guardarTraslado, guardarUnidad, registrarCobro, registrarGastoDeTraslado } from "@/lib/transporte/servicio";
import type { EstadoForm } from "@/components/formulario";

const gestionar = () => requireModulo("transporte", "transporte:gestionar");
const finanzas = () => requireModulo("transporte", "transporte:finanzas");
const refrescar = () => { revalidatePath("/transporte", "layout"); revalidatePath("/reservas", "layout"); };
const esperado = (e: unknown) => e instanceof ErrorTransporte || e instanceof ErrorFinanzas;

async function conErrores(fn: () => Promise<EstadoForm>): Promise<EstadoForm> {
  try { return await fn(); } catch (e) {
    if (esperado(e)) return { error: (e as Error).message };
    throw e;
  }
}

const trasladoSchema = z.object({
  reservaId: z.string().min(1, "Elige la reserva"), tipo: z.enum(["IDA", "REGRESO"]), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  hora: z.string().min(1, "Indica la hora de recogida"), duracion: z.string().min(1), origen: z.string().trim().max(200), destino: z.string().trim().max(200),
  pax: z.string().min(1, "Indica los pasajeros"), unidadId: z.string().optional(), choferId: z.string().optional(), precio: z.string().optional(), notas: z.string().trim().max(500).optional(),
});

export async function guardarTrasladoAccion(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await gestionar();
  const p = trasladoSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const horaMin = horaAMinutos(p.data.hora), precio = p.data.precio?.trim() ? pesosACentavos(p.data.precio) : 0;
  if (horaMin === null) return { error: "Hora inválida." };
  if (precio === null) return { error: "Precio inválido." };
  let nuevoId: string | null = null;
  const r = await conErrores(async () => {
    const t = await withTenant(s.tenantId, (tx) => guardarTraslado(tx, s.tenantId, id, {
      reservaId: p.data.reservaId, tipo: p.data.tipo, fecha: p.data.fecha, horaMin, duracionMin: Number(p.data.duracion), origen: p.data.origen, destino: p.data.destino,
      pax: Number(p.data.pax), unidadId: p.data.unidadId || null, choferId: p.data.choferId || null, precioCentavos: precio, notas: p.data.notas, usuarioId: s.usuarioId,
    }));
    nuevoId = t.id;
    refrescar();
    return { ok: "Traslado guardado." };
  });
  if (!r?.error && !id && nuevoId) redirect(`/transporte/${nuevoId}`);
  return r;
}

export async function estadoAccion(id: string, estado: "PROGRAMADO" | "COMPLETADO" | "CANCELADO") {
  const s = await gestionar();
  try { await withTenant(s.tenantId, (tx) => cambiarEstado(tx, id, estado)); } catch (e) {
    if (esperado(e)) return { error: (e as Error).message };
    throw e;
  }
  refrescar();
  return { ok: true };
}

const unidadSchema = z.object({ nombre: z.string().trim().min(2, "Escribe el nombre").max(60), placas: z.string().trim().max(20).optional(), capacidad: z.string().min(1, "Indica la capacidad"), notas: z.string().trim().max(300).optional() });

export async function guardarUnidadAccion(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await gestionar();
  const p = unidadSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => guardarUnidad(tx, s.tenantId, id, { ...p.data, capacidad: Number(p.data.capacidad) }));
    refrescar();
    return { ok: id ? "Unidad actualizada." : "Unidad creada." };
  });
}

export async function alternarUnidadAccion(id: string, activa: boolean) {
  const s = await gestionar();
  await withTenant(s.tenantId, (tx) => tx.unidadTransporte.update({ where: { id }, data: { activa } }));
  refrescar();
}

export async function cobroAccion(id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await finanzas();
  const p = z.object({ cuentaId: z.string().min(1, "Elige la cuenta"), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"), categoriaId: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => registrarCobro(tx, s.tenantId, id, { cuentaId: p.data.cuentaId, fecha: p.data.fecha, categoriaId: p.data.categoriaId || null, usuarioId: s.usuarioId }));
    refrescar();
    return { ok: "Cobro registrado." };
  });
}

export async function anularCobroAccion(id: string) {
  const s = await finanzas();
  try { await withTenant(s.tenantId, (tx) => anularCobro(tx, id, s.usuarioId)); } catch (e) {
    if (esperado(e)) return { error: (e as Error).message };
    throw e;
  }
  refrescar();
  return { ok: true };
}

export async function gastoAccion(id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await finanzas();
  const p = z.object({
    concepto: z.string().trim().min(2, "Escribe el concepto").max(120), cuentaId: z.string().min(1, "Elige la cuenta"), monto: z.string().min(1, "Escribe el monto"),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"), categoriaId: z.string().optional(), proveedor: z.string().trim().max(120).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const montoCentavos = pesosACentavos(p.data.monto);
  if (!montoCentavos) return { error: "Monto inválido." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => registrarGastoDeTraslado(tx, s.tenantId, id, { concepto: p.data.concepto, cuentaId: p.data.cuentaId, fecha: p.data.fecha, montoCentavos, categoriaId: p.data.categoriaId || null, proveedor: p.data.proveedor, usuarioId: s.usuarioId }));
    refrescar();
    return { ok: "Gasto registrado." };
  });
}
