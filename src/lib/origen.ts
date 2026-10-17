import "server-only";
import { headers } from "next/headers";

/** Origen real de la petición (https://dominio). Sirve para armar las URLs de retorno de Google y de
 *  Stripe en el MISMO dominio donde está el usuario. Tanto Supabase como Stripe validan a dónde se
 *  puede volver, así que un origen falso no abre nada. */
export async function origenActual() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
}
