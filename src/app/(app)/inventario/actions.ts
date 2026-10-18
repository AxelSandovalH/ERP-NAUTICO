"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { pesosACentavos } from "@/lib/fechas";
import { ErrorFinanzas } from "@/lib/finanzas/servicio";
import { leerCantidad } from "@/lib/inventario/cantidades";
import {
  ErrorInventario, anularMovimiento, crearAlmacen, guardarArticulo, registrarCompra, registrarConsumo, registrarConteo, registrarMerma, traspasar,
} from "@/lib/inventario/servicio";
import type { EstadoForm } from "@/components/formulario";

const administrar = () => requireModulo("inventario", "inventario:administrar");
const operar = () => requireModulo("inventario", "inventario:operar");
const refrescar = () => revalidatePath("/inventario", "layout");
const esperado = (e: unknown) => e instanceof ErrorInventario || e instanceof ErrorFinanzas;

async function conErrores(fn: () => Promise<EstadoForm>): Promise<EstadoForm> {
  try { return await fn(); } catch (e) {
    if (esperado(e)) return { error: (e as Error).message };
    throw e;
  }
}

const base = z.object({ articuloId: z.string().min(1, "Elige el artículo"), ubicacionId: z.string().min(1, "Elige la ubicación"), cantidad: z.string().min(1, "Escribe la cantidad"), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"), notas: z.string().trim().max(300).optional() });
const cantidadDe = (t: string) => leerCantidad(t);

export async function compraAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await administrar();
  const p = base.extend({ total: z.string().min(1, "Escribe el total pagado"), cuentaId: z.string().optional(), categoriaId: z.string().optional(), proveedor: z.string().trim().max(120).optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const cantidadMilli = cantidadDe(p.data.cantidad), totalCentavos = pesosACentavos(p.data.total);
  if (cantidadMilli === null) return { error: "Cantidad inválida (hasta 3 decimales)." };
  if (totalCentavos === null) return { error: "Total inválido." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => registrarCompra(tx, s.tenantId, { articuloId: p.data.articuloId, ubicacionId: p.data.ubicacionId, cantidadMilli, fecha: p.data.fecha, totalCentavos, cuentaId: p.data.cuentaId || null, categoriaId: p.data.categoriaId || null, proveedor: p.data.proveedor, notas: p.data.notas, usuarioId: s.usuarioId }));
    refrescar();
    return { ok: p.data.cuentaId ? "Compra registrada y gasto creado." : "Compra registrada." };
  });
}

function salidaAccion(tipo: "consumo" | "merma") {
  return async (_: EstadoForm, fd: FormData): Promise<EstadoForm> => {
    const s = await operar();
    const p = base.safeParse(Object.fromEntries(fd));
    if (!p.success) return { error: p.error.issues[0].message };
    const cantidadMilli = cantidadDe(p.data.cantidad);
    if (cantidadMilli === null) return { error: "Cantidad inválida (hasta 3 decimales)." };
    return conErrores(async () => {
      const e = { articuloId: p.data.articuloId, ubicacionId: p.data.ubicacionId, cantidadMilli, fecha: p.data.fecha, notas: p.data.notas, usuarioId: s.usuarioId };
      await withTenant(s.tenantId, (tx) => (tipo === "consumo" ? registrarConsumo : registrarMerma)(tx, s.tenantId, e));
      refrescar();
      return { ok: tipo === "consumo" ? "Consumo registrado." : "Merma registrada." };
    });
  };
}
export const consumoAccion = salidaAccion("consumo");
export const mermaAccion = salidaAccion("merma");

export async function traspasoAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await operar();
  const p = base.omit({ ubicacionId: true }).extend({ origenId: z.string().min(1, "Elige el origen"), destinoId: z.string().min(1, "Elige el destino") }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const cantidadMilli = cantidadDe(p.data.cantidad);
  if (cantidadMilli === null) return { error: "Cantidad inválida (hasta 3 decimales)." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => traspasar(tx, s.tenantId, { articuloId: p.data.articuloId, origenId: p.data.origenId, destinoId: p.data.destinoId, cantidadMilli, fecha: p.data.fecha, notas: p.data.notas, usuarioId: s.usuarioId }));
    refrescar();
    return { ok: "Traspaso registrado." };
  });
}

/** Conteo físico: los campos `c_<articuloId>` con valor son lo contado; los vacíos se omiten. */
export async function conteoAccion(ubicacionId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await operar();
  const fecha = String(fd.get("fecha") ?? "");
  const lineas: { articuloId: string; contadoMilli: number }[] = [];
  for (const [campo, valor] of fd.entries()) {
    if (!campo.startsWith("c_") || typeof valor !== "string" || !valor.trim()) continue;
    const contadoMilli = cantidadDe(valor);
    if (contadoMilli === null) return { error: "Hay una cantidad contada inválida (usa números, hasta 3 decimales)." };
    lineas.push({ articuloId: campo.slice(2), contadoMilli });
  }
  if (lineas.length === 0) return { error: "Captura al menos una cantidad contada." };
  return conErrores(async () => {
    const r = await withTenant(s.tenantId, (tx) => registrarConteo(tx, s.tenantId, { ubicacionId, fecha, lineas, notas: String(fd.get("notas") ?? ""), usuarioId: s.usuarioId }), { timeoutMs: 60_000 });
    refrescar();
    return { ok: r.ajustes.length ? `Conteo registrado: ${r.ajustes.length} diferencia${r.ajustes.length === 1 ? "" : "s"} ajustada${r.ajustes.length === 1 ? "" : "s"}.` : "Conteo registrado: todo cuadra." };
  });
}

const articuloSchema = z.object({ nombre: z.string().trim().min(2, "Escribe el nombre").max(80), unidad: z.string().trim().min(1, "Indica la unidad").max(20), categoria: z.string().trim().max(60).optional(), minimo: z.string().optional(), notas: z.string().trim().max(300).optional() });

export async function guardarArticuloAccion(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await administrar();
  const p = articuloSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const minimoMilli = p.data.minimo?.trim() ? cantidadDe(p.data.minimo) : 0;
  if (minimoMilli === null) return { error: "Existencia mínima inválida." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => guardarArticulo(tx, s.tenantId, id, { ...p.data, minimoMilli }));
    refrescar();
    return { ok: id ? "Artículo actualizado." : "Artículo creado." };
  });
}

export async function alternarArticuloAccion(id: string, activo: boolean) {
  const s = await administrar();
  await withTenant(s.tenantId, (tx) => tx.articulo.update({ where: { id }, data: { activo } }));
  refrescar();
}

export async function crearAlmacenAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await administrar();
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => crearAlmacen(tx, s.tenantId, String(fd.get("nombre") ?? "")));
    refrescar();
    return { ok: "Almacén creado." };
  });
}

export async function anularAccion(id: string, motivo: string) {
  const s = await administrar();
  try { await withTenant(s.tenantId, (tx) => anularMovimiento(tx, id, motivo, s.usuarioId)); } catch (e) {
    if (esperado(e)) return { error: (e as Error).message };
    throw e;
  }
  refrescar();
  return { ok: true };
}
