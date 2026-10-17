// Utilidades del navegador para comprobantes: reducir fotos y subirlas directo a Storage.
import { createClient } from "@supabase/supabase-js";
import { BUCKET, esMimePermitido, validarArchivo } from "./reglas";
import { confirmarComprobanteAccion, prepararSubidaAccion } from "@/app/(app)/gastos/comprobantes-actions";

const LADO_MAX = 1800; // px: suficiente para leer un ticket y mucho menos pesado que la foto original

/** Reduce las fotos grandes del celular a un JPEG ligero (los PDF y las fotos ya chicas pasan igual). */
export async function prepararArchivo(f: File): Promise<File> {
  if (!f.type.startsWith("image/")) return f;
  try {
    const img = await createImageBitmap(f, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
    if (escala === 1 && f.size <= 1.5 * 1024 * 1024) return f;
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    return blob ? new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f; // si el navegador no puede decodificarla, se sube tal cual (se valida después)
  }
}

let supabase: ReturnType<typeof createClient> | null = null;
const cliente = () => (supabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }));

/** Sube un archivo como comprobante de un gasto: pide permiso, sube directo a Storage y lo registra. */
export async function subirComprobante(gastoId: string, archivo: File): Promise<{ error?: string }> {
  const motivo = validarArchivo({ mime: archivo.type, tamano: archivo.size });
  if (motivo || !esMimePermitido(archivo.type)) return { error: motivo ?? "Tipo de archivo no permitido." };
  const p = await prepararSubidaAccion(gastoId, { nombre: archivo.name, mime: archivo.type, tamano: archivo.size });
  if ("error" in p) return { error: p.error };
  const { error } = await cliente().storage.from(BUCKET).uploadToSignedUrl(p.ruta, p.token, archivo, { contentType: archivo.type });
  if (error) return { error: "No se pudo subir el archivo." };
  const r = await confirmarComprobanteAccion(gastoId, { ruta: p.ruta, nombre: archivo.name });
  return r.error ? { error: r.error } : {};
}
