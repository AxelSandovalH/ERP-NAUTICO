import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// Crea el bucket PRIVADO de comprobantes en Supabase Storage (idempotente). Uso: npm run db:storage
// Límites del bucket: 10 MB por archivo y solo JPG, PNG, WebP y PDF.
const BUCKET = "comprobantes";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env");
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) { console.log(`El bucket "${BUCKET}" ya existe (${data.public ? "PÚBLICO — revísalo" : "privado"}).`); return; }
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  });
  if (error) throw error;
  console.log(`Bucket privado "${BUCKET}" creado.`);
}

// Bucket PÚBLICO de fotos de embarcaciones (5 MB, JPG/PNG/WebP)
async function fotos() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = createClient(url!, key!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data } = await admin.storage.getBucket("fotos-flota");
  if (data) { console.log('El bucket "fotos-flota" ya existe.'); return; }
  const { error } = await admin.storage.createBucket("fotos-flota", { public: true, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
  if (error) throw error;
  console.log('Bucket público "fotos-flota" creado.');
}

main().then(fotos).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
