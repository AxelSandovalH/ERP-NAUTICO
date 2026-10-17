import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Cliente con la service role key: ignora RLS y puede administrar usuarios de
 *  Auth. SOLO servidor, y solo para altas/bajas de usuarios; nunca para datos
 *  de negocio (esos van por Prisma + withTenant). */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
