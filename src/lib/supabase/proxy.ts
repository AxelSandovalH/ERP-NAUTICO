import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Los webhooks de Stripe no traen sesión: se autentican con la firma del evento
const PUBLICAS = ["/login", "/registro", "/auth/callback", "/api/webhooks", "/privacidad", "/terminos", "/opengraph-image", "/twitter-image", "/robots.txt", "/sitemap.xml"];

/** Refresca la sesión de Supabase en cada request y protege las rutas privadas.
 *  Es un chequeo optimista (verifica el JWT); la autorización real ocurre en
 *  getSesion(), que además valida usuario y tenant activos. */
export async function actualizarSesion(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        respuesta = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const autenticado = !!data?.claims;
  const { pathname } = request.nextUrl;
  const publica = pathname === "/" || PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!autenticado && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return respuesta;
}
