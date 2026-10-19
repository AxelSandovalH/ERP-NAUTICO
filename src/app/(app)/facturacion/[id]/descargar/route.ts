import { NextResponse } from "next/server";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { ErrorFacturacion, apiDeEmpresa, descargasDeFactura } from "@/lib/facturacion/servicio";

/** Pide a Procura un enlace firmado de corta vida para el XML o el PDF y redirige a él. El archivo nunca pasa por FleetNautic ni se guarda. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("facturacion", "facturacion:ver");
  const tipo = new URL(request.url).searchParams.get("tipo");
  if (tipo !== "xml" && tipo !== "pdf") return new Response("Tipo inválido", { status: 400 });
  try {
    const api = await withTenant(s.tenantId, (tx) => apiDeEmpresa(tx, s.tenantId));
    const d = await descargasDeFactura({ tenantId: s.tenantId, usuarioId: s.usuarioId, db: (fn) => withTenant(s.tenantId, fn), api }, id);
    const url = tipo === "xml" ? d.xmlUrl : d.pdfUrl;
    if (!url) return new Response(`El ${tipo.toUpperCase()} aún no está disponible.`, { status: 404 });
    return NextResponse.redirect(url, 302);
  } catch (e) {
    if (e instanceof ErrorFacturacion) return new Response(e.message, { status: 409 });
    throw e;
  }
}
