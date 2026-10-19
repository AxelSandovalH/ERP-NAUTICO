import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, BUCKET_FOTOS, MAX_BYTES, MAX_FOTO_BYTES, MIMES, MIMES_FOTO } from "./reglas";

/** Cliente de Storage con la service role: solo para firmar URLs y administrar objetos del bucket
 *  privado. El bucket no tiene políticas públicas: nadie lo lee ni escribe sin una URL firmada. */
export const almacen = () => createAdminClient().storage.from(BUCKET);

/** Crea el bucket privado si no existe (idempotente). */
export async function asegurarBucket() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return { creado: false };
  const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: Object.keys(MIMES) });
  if (error) throw error;
  return { creado: true };
}

/** Bucket PÚBLICO de fotos de embarcaciones: se lee por URL pública; solo se escribe con URL firmada desde el servidor. */
export const almacenFotos = () => createAdminClient().storage.from(BUCKET_FOTOS);

export async function asegurarBucketFotos() {
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(BUCKET_FOTOS);
  if (data) return { creado: false };
  const { error } = await admin.storage.createBucket(BUCKET_FOTOS, { public: true, fileSizeLimit: MAX_FOTO_BYTES, allowedMimeTypes: Object.keys(MIMES_FOTO) });
  if (error) throw error;
  return { creado: true };
}
