import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, MAX_BYTES, MIMES } from "./reglas";

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
