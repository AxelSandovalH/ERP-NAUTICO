import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { datosDeReporte } from "@/lib/conciliacion/datos-reporte";
import { csvDeReporte } from "@/lib/conciliacion/reporte";

export async function GET(request: Request, { params }: { params: Promise<{ cuentaId: string }> }) {
  const { cuentaId } = await params;
  const s = await requireModulo("conciliacion", "conciliacion:administrar");
  const url = new URL(request.url);
  const mes = url.searchParams.get("mes") ?? "";
  const d = await withTenant(s.tenantId, (tx) => datosDeReporte(tx, cuentaId, mes, url.searchParams.get("saldo") ?? undefined));
  if (!d || !d.cuadre || !("soloBanco" in d)) return new Response("No hay datos para ese mes", { status: 404 });
  const csv = csvDeReporte({
    cuenta: d.cuenta.nombre, moneda: d.cuenta.moneda, mes,
    saldoBancoCentavos: d.cuadre.saldoBancoCentavos, saldoSistemaCentavos: d.cuadre.saldoSistemaCentavos,
    diferencia: d.cuadre.diferencia, explicada: d.cuadre.explicada, sinExplicar: d.cuadre.sinExplicar,
    soloBanco: d.soloBanco, soloSistema: d.cuadre.soloSistema,
  });
  const nombre = `conciliacion-${d.cuenta.nombre.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${mes}.csv`;
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${nombre}"`, "cache-control": "no-store" } });
}
