"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { pesosACentavos } from "@/lib/fechas";
import { ErrorFinanzas } from "@/lib/finanzas/servicio";
import { horaAMinutos } from "@/lib/reservas/disponibilidad";
import { borrarFoto, confirmarFoto, prepararFoto } from "@/lib/storage/fotos-servidor";
import {
  ErrorActividades, cambiarEstadoSalida, cambiarPaxReserva, cancelarReservaActividad, editarSalida, eliminarPagoActividad, guardarActividad, programarSalida,
  registrarPagoActividad, reservarActividad,
} from "@/lib/actividades/servicio";
import type { EstadoForm } from "@/components/formulario";

const escribir = () => requireModulo("actividades", "actividades:escribir");
const reservar = () => requireModulo("actividades", "actividades:reservar");
const cobrar = () => requireModulo("actividades", "actividades:cobrar");
// El calendario también muestra las salidas
const refrescar = () => { revalidatePath("/actividades", "layout"); revalidatePath("/calendario", "layout"); };
const esperado = (e: unknown) => e instanceof ErrorActividades || e instanceof ErrorFinanzas;

async function conErrores<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try { return await fn(); } catch (e) {
    if (esperado(e)) return { error: (e as Error).message };
    throw e;
  }
}

const num = (v: string | undefined) => (v && v.trim() ? Number(v) : undefined);
const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

// ─── catálogo ────────────────────────────────────────────────────────────────

const actividadSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(80),
  descripcion: z.string().trim().max(1000).optional(),
  horas: z.string().min(1, "Indica la duración"),
  precio: z.string().min(1, "Indica el precio por persona"),
  cupo: z.string().min(1, "Indica el cupo"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
  puntoEncuentro: z.string().trim().max(200).optional(),
  notas: z.string().trim().max(1000).optional(),
});

export async function guardarActividadAccion(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await escribir();
  const p = actividadSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const precio = pesosACentavos(p.data.precio);
  if (precio === null) return { error: "Precio inválido." };
  let nuevoId: string | null = null;
  const r = await conErrores(async () => {
    const a = await withTenant(s.tenantId, (tx) => guardarActividad(tx, s.tenantId, id, {
      nombre: p.data.nombre, descripcion: p.data.descripcion, duracionMin: Math.round(Number(p.data.horas) * 60), precioCentavos: precio, cupo: Number(p.data.cupo),
      color: p.data.color, puntoEncuentro: p.data.puntoEncuentro, notas: p.data.notas,
    }));
    nuevoId = a.id;
    refrescar();
    return { ok: "Actividad guardada." } as EstadoForm;
  });
  if (!(r && "error" in r) && !id && nuevoId) redirect(`/actividades/${nuevoId}`);
  return r;
}

export async function alternarActividadAccion(id: string, activa: boolean) {
  const s = await escribir();
  await withTenant(s.tenantId, (tx) => tx.actividad.update({ where: { id }, data: { activa } }));
  refrescar();
}

// ─── salidas ─────────────────────────────────────────────────────────────────

const salidaSchema = z.object({
  actividadId: z.string().min(1, "Elige la actividad"), fecha: fechaSchema, hora: z.string().min(1, "Indica la hora"),
  cupo: z.string().optional(), precio: z.string().optional(), embarcacionId: z.string().optional(), guiaId: z.string().optional(), notas: z.string().trim().max(500).optional(),
});

export async function programarSalidaAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await escribir();
  const p = salidaSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const inicioMin = horaAMinutos(p.data.hora);
  if (inicioMin === null) return { error: "Hora inválida." };
  const precio = p.data.precio?.trim() ? pesosACentavos(p.data.precio) : undefined;
  if (precio === null) return { error: "Precio inválido." };
  let nuevoId: string | null = null;
  const r = await conErrores(async () => {
    const sal = await withTenant(s.tenantId, (tx) => programarSalida(tx, s.tenantId, {
      actividadId: p.data.actividadId, fecha: p.data.fecha, inicioMin, cupo: num(p.data.cupo), precioCentavos: precio,
      embarcacionId: p.data.embarcacionId || null, guiaId: p.data.guiaId || null, notas: p.data.notas,
    }));
    nuevoId = sal.id;
    refrescar();
    return { ok: "Salida programada." } as EstadoForm;
  });
  if (!(r && "error" in r) && nuevoId) redirect(`/actividades/salidas/${nuevoId}`);
  return r;
}

export async function editarSalidaAccion(id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await escribir();
  const p = salidaSchema.omit({ actividadId: true }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const inicioMin = horaAMinutos(p.data.hora);
  if (inicioMin === null) return { error: "Hora inválida." };
  const precio = p.data.precio?.trim() ? pesosACentavos(p.data.precio) : undefined;
  if (precio === null) return { error: "Precio inválido." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => editarSalida(tx, id, {
      fecha: p.data.fecha, inicioMin, cupo: num(p.data.cupo), precioCentavos: precio, embarcacionId: p.data.embarcacionId || null, guiaId: p.data.guiaId || null, notas: p.data.notas ?? "",
    }));
    refrescar();
    return { ok: "Salida actualizada." } as EstadoForm;
  });
}

export async function estadoSalidaAccion(id: string, estado: "COMPLETADA" | "CANCELADA") {
  const s = await escribir();
  const r = await conErrores(async () => { await withTenant(s.tenantId, (tx) => cambiarEstadoSalida(tx, id, estado)); return { ok: true }; });
  if (!("error" in r)) refrescar();
  return r;
}

// ─── reservas ────────────────────────────────────────────────────────────────

const reservaSchema = z.object({
  clienteId: z.string().optional(), nombre: z.string().trim().max(120).optional(), telefono: z.string().trim().max(40).optional(),
  pax: z.string().min(1, "Indica cuántas personas"), origen: z.enum(["DIRECTO", "WEB", "AGENCIA", "CONCIERGE"]).default("DIRECTO"), notas: z.string().trim().max(500).optional(),
});

export async function reservarAccion(salidaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await reservar();
  const p = reservaSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => reservarActividad(tx, s.tenantId, {
      salidaId, pax: Number(p.data.pax), clienteId: p.data.clienteId || null, cliente: p.data.nombre ? { nombre: p.data.nombre, telefono: p.data.telefono } : undefined,
      origen: p.data.origen, notas: p.data.notas, creadorId: s.usuarioId,
    }));
    refrescar();
    return { ok: "Reserva creada." } as EstadoForm;
  });
}

export async function cambiarPaxAccion(reservaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await reservar();
  const pax = Number(fd.get("pax"));
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => cambiarPaxReserva(tx, reservaId, pax));
    refrescar();
    return { ok: "Personas actualizadas." } as EstadoForm;
  });
}

export async function cancelarReservaAccion(reservaId: string) {
  const s = await reservar();
  const r = await conErrores(async () => { await withTenant(s.tenantId, (tx) => cancelarReservaActividad(tx, reservaId)); return { ok: true }; });
  if (!("error" in r)) refrescar();
  return r;
}

// ─── cobros ──────────────────────────────────────────────────────────────────

const pagoSchema = z.object({ monto: z.string().min(1, "Indica el monto"), metodo: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"]), referencia: z.string().trim().max(120).optional() });

export async function pagoAccion(reservaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await cobrar();
  const p = pagoSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const monto = pesosACentavos(p.data.monto);
  if (monto === null) return { error: "Monto inválido." };
  return conErrores(async () => {
    const r = await withTenant(s.tenantId, (tx) => registrarPagoActividad(tx, s.tenantId, { reservaId, montoCentavos: monto, metodo: p.data.metodo, referencia: p.data.referencia }));
    refrescar();
    revalidatePath("/ingresos", "layout");
    return { ok: r.ingresoCreado ? "Pago registrado." : "Pago registrado, pero no se creó el ingreso: configura la cuenta de ese método en Cuentas." } as EstadoForm;
  });
}

export async function eliminarPagoAccion(pagoId: string) {
  const s = await cobrar();
  const r = await conErrores(async () => { await withTenant(s.tenantId, (tx) => eliminarPagoActividad(tx, pagoId, s.usuarioId)); return { ok: true }; });
  if (!("error" in r)) { refrescar(); revalidatePath("/ingresos", "layout"); }
  return r;
}

// ─── foto de la actividad ────────────────────────────────────────────────────

export async function prepararFotoActividadAccion(id: string, a: { mime: string; tamano: number }): Promise<{ error: string } | { ruta: string; token: string }> {
  const s = await escribir();
  if (!(await withTenant(s.tenantId, (tx) => tx.actividad.findUnique({ where: { id }, select: { id: true } })))) return { error: "La actividad no existe." };
  return prepararFoto(s.tenantId, id, a);
}

export async function confirmarFotoActividadAccion(id: string, ruta: string): Promise<{ error?: string; ok?: true }> {
  const s = await escribir();
  const r = await confirmarFoto(s.tenantId, id, ruta, (nueva) => withTenant(s.tenantId, async (tx) => {
    const a = await tx.actividad.findUnique({ where: { id }, select: { fotoRuta: true } });
    if (!a) return undefined;
    await tx.actividad.update({ where: { id }, data: { fotoRuta: nueva } });
    return a.fotoRuta;
  }));
  refrescar();
  return r;
}

export async function quitarFotoActividadAccion(id: string): Promise<{ error?: string; ok?: true }> {
  const s = await escribir();
  const anterior = await withTenant(s.tenantId, async (tx) => {
    const a = await tx.actividad.findUnique({ where: { id }, select: { fotoRuta: true } });
    if (!a) return undefined;
    await tx.actividad.update({ where: { id }, data: { fotoRuta: null } });
    return a.fotoRuta;
  });
  if (anterior === undefined) return { error: "La actividad no existe." };
  await borrarFoto(anterior);
  refrescar();
  return { ok: true };
}
