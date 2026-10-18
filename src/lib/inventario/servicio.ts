import { randomUUID } from "node:crypto";
import type { Tx } from "@/lib/db/tenant";
import { aDate, esIso } from "@/lib/fechas";
import { cancelarGastoDeInventario, registrarGasto } from "@/lib/finanzas/servicio";
import { cantidadTexto, costoPromedio, costoUnitario, porReabastecer, valorCentavos } from "./cantidades";

export class ErrorInventario extends Error {}

const CLAVE_MAX = 2_000_000_000;

// ─── ubicaciones ─────────────────────────────────────────────────────────────

/** Deja lista la estructura: un almacén principal y una ubicación por embarcación (idempotente). */
export async function asegurarUbicaciones(tx: Tx, tenantId: string) {
  if ((await tx.ubicacion.count({ where: { tipo: "ALMACEN" } })) === 0) {
    await tx.ubicacion.upsert({ where: { tenantId_nombre: { tenantId, nombre: "Almacén principal" } }, update: {}, create: { tenantId, nombre: "Almacén principal", tipo: "ALMACEN" } });
  }
  const conUbicacion = new Set((await tx.ubicacion.findMany({ where: { embarcacionId: { not: null } }, select: { embarcacionId: true } })).map((u) => u.embarcacionId));
  const nombres = new Set((await tx.ubicacion.findMany({ select: { nombre: true } })).map((u) => u.nombre));
  for (const e of await tx.embarcacion.findMany({ select: { id: true, nombre: true } })) {
    if (conUbicacion.has(e.id)) continue;
    const nombre = nombres.has(e.nombre) ? `${e.nombre} (embarcación)` : e.nombre;
    await tx.ubicacion.create({ data: { tenantId, nombre, tipo: "EMBARCACION", embarcacionId: e.id } });
    nombres.add(nombre);
  }
}

export async function crearAlmacen(tx: Tx, tenantId: string, nombre: string) {
  if (nombre.trim().length < 2) throw new ErrorInventario("Escribe el nombre del almacén.");
  if (await tx.ubicacion.findFirst({ where: { nombre: nombre.trim() }, select: { id: true } })) throw new ErrorInventario("Ya tienes una ubicación con ese nombre.");
  return tx.ubicacion.create({ data: { tenantId, nombre: nombre.trim(), tipo: "ALMACEN" } });
}

// ─── artículos ───────────────────────────────────────────────────────────────

export type EntradaArticulo = { nombre: string; unidad: string; categoria?: string; minimoMilli: number; notas?: string; activo?: boolean };

export async function guardarArticulo(tx: Tx, tenantId: string, id: string | null, e: EntradaArticulo) {
  const nombre = e.nombre.trim(), unidad = e.unidad.trim();
  if (nombre.length < 2) throw new ErrorInventario("Escribe el nombre del artículo.");
  if (!unidad) throw new ErrorInventario("Indica la unidad (pieza, litro, kg, caja…).");
  if (!Number.isInteger(e.minimoMilli) || e.minimoMilli < 0 || e.minimoMilli > CLAVE_MAX) throw new ErrorInventario("La existencia mínima es inválida.");
  if (await tx.articulo.findFirst({ where: { nombre, ...(id ? { id: { not: id } } : {}) }, select: { id: true } })) throw new ErrorInventario("Ya tienes un artículo con ese nombre.");
  const datos = { nombre, unidad, categoria: e.categoria?.trim() || null, minimoMilli: e.minimoMilli, notas: e.notas?.trim() || null };
  if (id) {
    if (!(await tx.articulo.findUnique({ where: { id }, select: { id: true } }))) throw new ErrorInventario("El artículo no existe.");
    return tx.articulo.update({ where: { id }, data: { ...datos, ...(e.activo === undefined ? {} : { activo: e.activo }) } });
  }
  return tx.articulo.create({ data: { tenantId, ...datos } });
}

// ─── existencias ─────────────────────────────────────────────────────────────

/** Existencia por artículo y ubicación (suma de los movimientos vigentes). */
export async function existencias(tx: Tx): Promise<Map<string, number>> {
  const filas = await tx.movimientoInventario.groupBy({ by: ["articuloId", "ubicacionId"], where: { estado: "ACTIVO" }, _sum: { cantidadMilli: true } });
  return new Map(filas.map((f) => [`${f.articuloId}|${f.ubicacionId}`, f._sum.cantidadMilli ?? 0]));
}

async function existenciaDe(tx: Tx, articuloId: string, ubicacionId: string) {
  const r = await tx.movimientoInventario.aggregate({ where: { articuloId, ubicacionId, estado: "ACTIVO" }, _sum: { cantidadMilli: true } });
  return r._sum.cantidadMilli ?? 0;
}

/** Serializa los movimientos de un mismo artículo: dos salidas simultáneas no pueden dejar la existencia en negativo. */
const bloquear = (tx: Tx, articuloId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"inv:" + articuloId}, 0))`;

async function articuloYUbicacion(tx: Tx, articuloId: string, ubicacionId: string) {
  const a = await tx.articulo.findUnique({ where: { id: articuloId } });
  if (!a) throw new ErrorInventario("El artículo no existe.");
  if (!a.activo) throw new ErrorInventario(`El artículo ${a.nombre} está inactivo.`);
  const u = await tx.ubicacion.findUnique({ where: { id: ubicacionId } });
  if (!u) throw new ErrorInventario("La ubicación no existe.");
  if (!u.activa) throw new ErrorInventario(`La ubicación ${u.nombre} está inactiva.`);
  return { a, u };
}

const validarCantidad = (c: number) => { if (!Number.isInteger(c) || c <= 0 || c > CLAVE_MAX) throw new ErrorInventario("La cantidad debe ser mayor a cero."); };
const validarFecha = (f: string) => { if (!esIso(f)) throw new ErrorInventario("Fecha inválida."); };

// ─── movimientos ─────────────────────────────────────────────────────────────

export type EntradaCompra = {
  articuloId: string; ubicacionId: string; cantidadMilli: number; fecha: string;
  /** Lo que se pagó, en la moneda de la cuenta (o en la moneda base si no se elige cuenta) */
  totalCentavos: number;
  /** Con cuenta se registra el gasto; sin cuenta solo entra al inventario (p. ej. inventario inicial) */
  cuentaId?: string | null; categoriaId?: string | null; proveedor?: string; notas?: string; usuarioId?: string;
};

export async function registrarCompra(tx: Tx, tenantId: string, e: EntradaCompra) {
  validarCantidad(e.cantidadMilli); validarFecha(e.fecha);
  if (!Number.isInteger(e.totalCentavos) || e.totalCentavos <= 0) throw new ErrorInventario("El total pagado debe ser mayor a cero.");
  const { a, u } = await articuloYUbicacion(tx, e.articuloId, e.ubicacionId);
  let gastoId: string | null = null, totalBase = e.totalCentavos;
  if (e.cuentaId) {
    const g = await registrarGasto(tx, tenantId, {
      concepto: `Compra de ${a.nombre} (${cantidadTexto(e.cantidadMilli)} ${a.unidad})`, cuentaId: e.cuentaId, fecha: e.fecha, montoCentavos: e.totalCentavos,
      categoriaId: e.categoriaId, proveedor: e.proveedor, notas: e.notas, usuarioId: e.usuarioId,
    });
    await tx.gasto.update({ where: { id: g.id }, data: { origen: "INVENTARIO" } });
    gastoId = g.id; totalBase = g.montoBaseCentavos;
  }
  return tx.movimientoInventario.create({
    data: {
      tenantId, articuloId: a.id, ubicacionId: u.id, tipo: "COMPRA", cantidadMilli: e.cantidadMilli, costoUnitarioCentavos: costoUnitario(totalBase, e.cantidadMilli),
      fecha: aDate(e.fecha), proveedor: e.proveedor?.trim() || null, notas: e.notas?.trim() || null, gastoId, registradoPorId: e.usuarioId,
    },
  });
}

async function salida(tx: Tx, tenantId: string, tipo: "CONSUMO" | "MERMA", e: { articuloId: string; ubicacionId: string; cantidadMilli: number; fecha: string; notas?: string; usuarioId?: string }) {
  validarCantidad(e.cantidadMilli); validarFecha(e.fecha);
  if (tipo === "MERMA" && (e.notas?.trim().length ?? 0) < 3) throw new ErrorInventario("Indica el motivo de la merma.");
  const { a, u } = await articuloYUbicacion(tx, e.articuloId, e.ubicacionId);
  await bloquear(tx, a.id);
  const hay = await existenciaDe(tx, a.id, u.id);
  if (hay < e.cantidadMilli) throw new ErrorInventario(`En ${u.nombre} solo hay ${cantidadTexto(hay)} ${a.unidad} de ${a.nombre}.`);
  return tx.movimientoInventario.create({
    data: { tenantId, articuloId: a.id, ubicacionId: u.id, tipo, cantidadMilli: -e.cantidadMilli, fecha: aDate(e.fecha), notas: e.notas?.trim() || null, registradoPorId: e.usuarioId },
  });
}
export const registrarConsumo = (tx: Tx, tenantId: string, e: Parameters<typeof salida>[3]) => salida(tx, tenantId, "CONSUMO", e);
export const registrarMerma = (tx: Tx, tenantId: string, e: Parameters<typeof salida>[3]) => salida(tx, tenantId, "MERMA", e);

export async function traspasar(tx: Tx, tenantId: string, e: { articuloId: string; origenId: string; destinoId: string; cantidadMilli: number; fecha: string; notas?: string; usuarioId?: string }) {
  if (e.origenId === e.destinoId) throw new ErrorInventario("El origen y el destino deben ser distintos.");
  validarCantidad(e.cantidadMilli); validarFecha(e.fecha);
  const { a, u: origen } = await articuloYUbicacion(tx, e.articuloId, e.origenId);
  const destino = (await articuloYUbicacion(tx, e.articuloId, e.destinoId)).u;
  await bloquear(tx, a.id);
  const hay = await existenciaDe(tx, a.id, origen.id);
  if (hay < e.cantidadMilli) throw new ErrorInventario(`En ${origen.nombre} solo hay ${cantidadTexto(hay)} ${a.unidad} de ${a.nombre}.`);
  const grupoId = randomUUID();
  const base = { tenantId, articuloId: a.id, fecha: aDate(e.fecha), notas: e.notas?.trim() || null, grupoId, registradoPorId: e.usuarioId };
  await tx.movimientoInventario.create({ data: { ...base, ubicacionId: origen.id, tipo: "TRASPASO_SALIDA", cantidadMilli: -e.cantidadMilli } });
  await tx.movimientoInventario.create({ data: { ...base, ubicacionId: destino.id, tipo: "TRASPASO_ENTRADA", cantidadMilli: e.cantidadMilli } });
  return { grupoId };
}

/** Conteo físico de una ubicación: lo contado contra lo que dice el sistema; cada diferencia queda como ajuste. */
export async function registrarConteo(
  tx: Tx, tenantId: string,
  e: { ubicacionId: string; fecha: string; lineas: { articuloId: string; contadoMilli: number }[]; notas?: string; usuarioId?: string },
) {
  validarFecha(e.fecha);
  const u = await tx.ubicacion.findUnique({ where: { id: e.ubicacionId } });
  if (!u || !u.activa) throw new ErrorInventario("La ubicación no existe o está inactiva.");
  const grupoId = randomUUID();
  const resultado: { articuloId: string; diferenciaMilli: number }[] = [];
  // En orden fijo: dos conteos simultáneos no se bloquean entre sí
  for (const l of [...e.lineas].sort((x, y) => x.articuloId.localeCompare(y.articuloId))) {
    if (!Number.isInteger(l.contadoMilli) || l.contadoMilli < 0 || l.contadoMilli > CLAVE_MAX) throw new ErrorInventario("Una cantidad contada es inválida.");
    const a = await tx.articulo.findUnique({ where: { id: l.articuloId } });
    if (!a) throw new ErrorInventario("El artículo no existe.");
    await bloquear(tx, a.id);
    const diferenciaMilli = l.contadoMilli - (await existenciaDe(tx, a.id, u.id));
    if (diferenciaMilli === 0) continue;
    await tx.movimientoInventario.create({
      data: { tenantId, articuloId: a.id, ubicacionId: u.id, tipo: "AJUSTE", cantidadMilli: diferenciaMilli, fecha: aDate(e.fecha), notas: e.notas?.trim() || "Conteo físico", grupoId, registradoPorId: e.usuarioId },
    });
    resultado.push({ articuloId: a.id, diferenciaMilli });
  }
  return { grupoId, ajustes: resultado };
}

/** Anula un movimiento (ambas mitades si es un traspaso). No procede si la existencia quedaría en negativo. */
export async function anularMovimiento(tx: Tx, id: string, motivo: string, usuarioId?: string) {
  const m = await tx.movimientoInventario.findUnique({ where: { id }, include: { articulo: true, ubicacion: true } });
  if (!m) throw new ErrorInventario("El movimiento no existe.");
  if (m.estado === "CANCELADO") throw new ErrorInventario("El movimiento ya está anulado.");
  if (motivo.trim().length < 3) throw new ErrorInventario("Indica el motivo de la anulación.");
  const afectados = m.tipo.startsWith("TRASPASO") && m.grupoId ? await tx.movimientoInventario.findMany({ where: { grupoId: m.grupoId, estado: "ACTIVO" }, include: { articulo: true, ubicacion: true } }) : [m];
  await bloquear(tx, m.articuloId);
  for (const x of afectados) {
    // Quitar una entrada resta existencia: no puede dejar la ubicación debajo de cero
    if (x.cantidadMilli > 0) {
      const hay = await existenciaDe(tx, x.articuloId, x.ubicacionId);
      if (hay - x.cantidadMilli < 0) throw new ErrorInventario(`No se puede anular: en ${x.ubicacion.nombre} ya se usó parte de ${x.articulo.nombre}.`);
    }
  }
  for (const x of afectados) {
    if (x.gastoId) await cancelarGastoDeInventario(tx, x.gastoId, usuarioId);
    await tx.movimientoInventario.update({ where: { id: x.id }, data: { estado: "CANCELADO", notas: [x.notas, `Anulado: ${motivo.trim()}`].filter(Boolean).join(" · ") } });
  }
}

// ─── consultas ───────────────────────────────────────────────────────────────

export type FilaArticulo = {
  id: string; nombre: string; unidad: string; categoria: string | null; minimoMilli: number; activo: boolean;
  totalMilli: number; porUbicacion: Map<string, number>; costoPromedioCentavos: number; valorCentavos: number; reabastecer: boolean;
};

/** Cada artículo con su existencia total y por ubicación, costo promedio, valor y si hay que reabastecer. */
export async function resumenInventario(tx: Tx): Promise<{ articulos: FilaArticulo[]; valorTotalCentavos: number }> {
  const articulos = await tx.articulo.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] });
  const ex = await existencias(tx);
  const compras = await tx.movimientoInventario.findMany({ where: { tipo: "COMPRA", estado: "ACTIVO", costoUnitarioCentavos: { not: null } }, select: { articuloId: true, cantidadMilli: true, costoUnitarioCentavos: true } });
  const comprasDe = new Map<string, { cantidadMilli: number; costoUnitarioCentavos: number }[]>();
  for (const c of compras) comprasDe.set(c.articuloId, [...(comprasDe.get(c.articuloId) ?? []), { cantidadMilli: c.cantidadMilli, costoUnitarioCentavos: c.costoUnitarioCentavos! }]);
  const filas = articulos.map((a): FilaArticulo => {
    const porUbicacion = new Map<string, number>();
    let total = 0;
    for (const [k, v] of ex) if (k.startsWith(`${a.id}|`) && v !== 0) { porUbicacion.set(k.split("|")[1], v); total += v; }
    const prom = costoPromedio(comprasDe.get(a.id) ?? []);
    return { id: a.id, nombre: a.nombre, unidad: a.unidad, categoria: a.categoria, minimoMilli: a.minimoMilli, activo: a.activo, totalMilli: total, porUbicacion, costoPromedioCentavos: prom, valorCentavos: valorCentavos(total, prom), reabastecer: a.activo && porReabastecer(total, a.minimoMilli) };
  });
  return { articulos: filas, valorTotalCentavos: filas.reduce((s, f) => s + f.valorCentavos, 0) };
}

/** Cuántos artículos activos están por debajo de su mínimo (para el panel). */
export async function contarPorReabastecer(tx: Tx): Promise<number> {
  return (await resumenInventario(tx)).articulos.filter((a) => a.reabastecer).length;
}
