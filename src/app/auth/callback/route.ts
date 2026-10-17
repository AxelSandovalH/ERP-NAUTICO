import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { createClient } from "@/lib/supabase/server";

// Destino de los retornos de Supabase Auth (flujo PKCE): confirmación de correo
// y Google. Después de intercambiar el código decide a dónde va la persona.
export async function GET(request: NextRequest) {
  const aviso = (e: string) => NextResponse.redirect(new URL(`/login?error=${e}`, request.url));
  const code = request.nextUrl.searchParams.get("code");
  // Google devuelve ?error=... si la persona cancela o el proveedor falla
  if (request.nextUrl.searchParams.get("error") || !code) return aviso(code ? "google" : "confirmacion");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return aviso("confirmacion");

  const { data } = await supabase.auth.getUser();
  if (!data.user) return aviso("confirmacion");
  const u = await prisma.usuario.findUnique({ where: { supabaseId: data.user.id }, include: { tenant: true } });
  // Entró con Google pero aún no tiene empresa → la crea en el onboarding
  if (!u) return NextResponse.redirect(new URL("/onboarding", request.url));
  if (!u.activo || !u.tenant.activo) {
    await supabase.auth.signOut();
    return aviso("inactivo");
  }
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
