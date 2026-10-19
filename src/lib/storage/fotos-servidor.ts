import "server-only";
import { randomUUID } from "node:crypto";
import { esMimeFoto, nuevaRutaFoto, rutaFotoPerteneceA, validarFoto } from "./reglas";
import { almacenFotos } from "./servidor";

/** Valida y firma la subida de una foto (el archivo viaja directo del navegador a Storage). `id` es el de la embarcación o la unidad. */
export async function prepararFoto(tenantId: string, id: string, a: { mime: string; tamano: number }): Promise<{ error: string } | { ruta: string; token: string }> {
  const motivo = validarFoto(a);
  if (motivo || !esMimeFoto(a.mime)) return { error: motivo ?? "Tipo de archivo no permitido." };
  const ruta = nuevaRutaFoto(tenantId, id, a.mime, randomUUID());
  const { data, error } = await almacenFotos().createSignedUploadUrl(ruta);
  if (error || !data) { console.error("[storage] no se pudo firmar la subida de foto:", error?.message); return { error: "No se pudo preparar la subida. Verifica que el almacenamiento esté configurado." }; }
  return { ruta, token: data.token };
}

/** Revisa el tipo y tamaño REALES del archivo subido y lo guarda con `guardar`, que devuelve la ruta anterior
 *  (null si no había) o undefined si el registro no existe. Borra la foto anterior; si algo falla, no queda nada huérfano. */
export async function confirmarFoto(tenantId: string, id: string, ruta: string, guardar: (ruta: string) => Promise<string | null | undefined>): Promise<{ error?: string; ok?: true }> {
  if (!rutaFotoPerteneceA(ruta, tenantId, id)) return { error: "Ruta de archivo inválida." };
  const archivo = ruta.split("/")[2];
  const { data, error } = await almacenFotos().list(`${tenantId}/${id}`, { search: archivo, limit: 5 });
  const obj = data?.find((o) => o.name === archivo);
  if (error || !obj) return { error: "No se encontró la foto subida. Inténtalo de nuevo." };
  const mime = String((obj.metadata as { mimetype?: string } | null)?.mimetype ?? "");
  const tamano = Number((obj.metadata as { size?: number } | null)?.size ?? 0);
  const motivo = validarFoto({ mime, tamano });
  if (motivo) { await almacenFotos().remove([ruta]); return { error: motivo }; }
  const anterior = await guardar(ruta);
  if (anterior === undefined) { await almacenFotos().remove([ruta]); return { error: "No se encontró el registro." }; }
  if (anterior) await almacenFotos().remove([anterior]);
  return { ok: true };
}

export async function borrarFoto(ruta: string | null | undefined) {
  if (ruta) await almacenFotos().remove([ruta]);
}
