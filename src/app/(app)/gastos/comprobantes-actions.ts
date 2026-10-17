"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { MAX_POR_GASTO, esMimePermitido, nombreSeguro, nuevaRuta, rutaPerteneceA, tipoRealDe, validarArchivo } from "@/lib/storage/reglas";
import { almacen } from "@/lib/storage/servidor";
import { crearLimitador } from "@/lib/ia/limite";
import { leerTicketConClaude } from "@/lib/ia/leer-ticket";
import { asegurarCategoriasBase } from "@/lib/finanzas/servicio";

/** Pide permiso para subir un archivo a un gasto: valida y devuelve una URL firmada de un solo uso.
 *  El archivo viaja directo del navegador a Storage, sin pasar por el servidor. */
export async function prepararSubidaAccion(gastoId: string, a: { nombre: string; mime: string; tamano: number }): Promise<{ error: string } | { ruta: string; token: string }> {
  const s = await requireModulo("gastos", "gastos:registrar");
  const motivo = validarArchivo({ mime: a.mime, tamano: a.tamano });
  if (motivo || !esMimePermitido(a.mime)) return { error: motivo ?? "Tipo de archivo no permitido." };
  const hay = await withTenant(s.tenantId, async (tx) => {
    if (!(await tx.gasto.findUnique({ where: { id: gastoId }, select: { id: true } }))) return "El gasto no existe.";
    if ((await tx.comprobante.count({ where: { gastoId } })) >= MAX_POR_GASTO) return `Cada gasto admite hasta ${MAX_POR_GASTO} comprobantes.`;
    return null;
  });
  if (hay) return { error: hay };
  const ruta = nuevaRuta(s.tenantId, gastoId, a.mime, randomUUID());
  const { data, error } = await almacen().createSignedUploadUrl(ruta);
  if (error || !data) { console.error("[storage] no se pudo firmar la subida:", error?.message); return { error: "No se pudo preparar la subida. Verifica que el almacenamiento esté configurado." }; }
  return { ruta, token: data.token };
}

/** Registra el comprobante una vez subido el archivo, tomando el tipo y tamaño REALES de Storage. */
export async function confirmarComprobanteAccion(gastoId: string, a: { ruta: string; nombre: string }): Promise<{ error?: string; ok?: true }> {
  const s = await requireModulo("gastos", "gastos:registrar");
  if (!rutaPerteneceA(a.ruta, s.tenantId, gastoId)) return { error: "Ruta de archivo inválida." };
  const archivo = a.ruta.split("/")[2];
  const { data, error } = await almacen().list(`${s.tenantId}/${gastoId}`, { search: archivo, limit: 5 });
  const obj = data?.find((o) => o.name === archivo);
  if (error || !obj) return { error: "No se encontró el archivo subido. Inténtalo de nuevo." };
  const mime = String((obj.metadata as { mimetype?: string } | null)?.mimetype ?? "");
  const tamano = Number((obj.metadata as { size?: number } | null)?.size ?? 0);
  if (validarArchivo({ mime, tamano })) {
    await almacen().remove([a.ruta]); // no se queda nada que no cumpla las reglas
    return { error: validarArchivo({ mime, tamano }) ?? "Archivo no válido." };
  }
  const resultado = await withTenant(s.tenantId, async (tx) => {
    if (!(await tx.gasto.findUnique({ where: { id: gastoId }, select: { id: true } }))) return "El gasto no existe.";
    if ((await tx.comprobante.count({ where: { gastoId } })) >= MAX_POR_GASTO) return `Cada gasto admite hasta ${MAX_POR_GASTO} comprobantes.`;
    await tx.comprobante.create({ data: { tenantId: s.tenantId, gastoId, ruta: a.ruta, nombreOriginal: nombreSeguro(a.nombre), mime, tamanoBytes: tamano, subidoPorId: s.usuarioId } });
    return null;
  });
  if (resultado) { await almacen().remove([a.ruta]); return { error: resultado }; }
  revalidatePath(`/gastos/${gastoId}`);
  revalidatePath("/gastos");
  return { ok: true };
}

/** URL firmada y corta (5 min) para ver un comprobante: el bucket es privado. */
export async function urlComprobanteAccion(id: string): Promise<{ error: string } | { url: string }> {
  const s = await requireModulo("gastos", "gastos:registrar");
  const c = await withTenant(s.tenantId, (tx) => tx.comprobante.findUnique({ where: { id }, select: { ruta: true } }));
  if (!c) return { error: "El comprobante no existe." };
  const { data, error } = await almacen().createSignedUrl(c.ruta, 300);
  if (error || !data) return { error: "No se pudo abrir el archivo." };
  return { url: data.signedUrl };
}

export async function eliminarComprobanteAccion(id: string): Promise<{ error?: string; ok?: true }> {
  const s = await requireModulo("gastos", "gastos:registrar");
  const c = await withTenant(s.tenantId, (tx) => tx.comprobante.findUnique({ where: { id } }));
  if (!c) return { error: "El comprobante no existe." };
  // Cualquiera con permiso de capturar puede quitar lo que subió; el resto, solo quien administra
  if (c.subidoPorId !== s.usuarioId && !puede(s.rol, "gastos:administrar")) return { error: "Solo puedes eliminar los comprobantes que subiste tú." };
  await almacen().remove([c.ruta]);
  await withTenant(s.tenantId, (tx) => tx.comprobante.delete({ where: { id } }));
  revalidatePath(`/gastos/${c.gastoId}`);
  return { ok: true };
}

// ─── lectura de tickets con IA ───────────────────────────────────────────────

const limite = crearLimitador(30, 60 * 60 * 1000); // 30 lecturas por persona y hora
const MAX_LECTURA_BYTES = 3.5 * 1024 * 1024;

export type TicketParaFormulario = { concepto: string; proveedor: string | null; monto: string | null; moneda: "MXN" | "USD" | null; fecha: string | null; categoria: string | null; rfc: string | null };

/** Lee un ticket con IA y devuelve campos para PRELLENAR el formulario. La persona los revisa antes de guardar. */
export async function extraerTicketAccion(fd: FormData): Promise<{ error: string } | { ticket: TicketParaFormulario }> {
  const s = await requireModulo("gastos", "gastos:registrar");
  if (!process.env.ANTHROPIC_API_KEY) return { error: "La lectura de tickets con IA no está activada en esta empresa." };
  if (!limite.intentar(s.usuarioId)) return { error: "Llegaste al límite de lecturas por hora. Captura el gasto a mano o inténtalo más tarde." };
  const f = fd.get("archivo");
  if (!(f instanceof File)) return { error: "Falta el archivo." };
  if (f.size === 0 || f.size > MAX_LECTURA_BYTES) return { error: "El archivo debe pesar menos de 3.5 MB." };
  const buf = new Uint8Array(await f.arrayBuffer());
  const mime = tipoRealDe(buf); // por contenido, no por lo que declare el navegador
  if (!mime) return { error: "Solo se pueden leer fotos (JPG, PNG, WebP) y PDF." };
  const categorias = await withTenant(s.tenantId, async (tx) => {
    await asegurarCategoriasBase(tx, s.tenantId);
    return (await tx.categoria.findMany({ where: { tipo: "GASTO", activa: true }, orderBy: { orden: "asc" }, select: { nombre: true } })).map((c) => c.nombre);
  });
  const r = await leerTicketConClaude({ datosBase64: Buffer.from(buf).toString("base64"), mime, categorias, zona: s.zonaHoraria });
  if (!r.ok) return { error: r.error };
  if (!r.ticket.esTicket) return { error: "Eso no parece un ticket o comprobante de compra." };
  const t = r.ticket;
  return { ticket: { concepto: t.concepto, proveedor: t.proveedor, monto: t.montoCentavos == null ? null : (t.montoCentavos / 100).toFixed(2), moneda: t.moneda, fecha: t.fecha, categoria: t.categoria, rfc: t.rfc } };
}
