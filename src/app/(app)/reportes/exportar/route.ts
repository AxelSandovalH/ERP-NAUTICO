import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { hoyIso } from "@/lib/fechas";
import { RANGO_POR_DEFECTO, esRango, periodoDe } from "@/lib/reportes/rangos";
import { reporteDe } from "@/lib/reportes/servicio";
import { csvDeReporte } from "@/lib/reportes/csv";

export async function GET(request: Request) {
  const s = await requireModulo("reportes", "reportes:ver");
  const r = new URL(request.url).searchParams.get("rango");
  const id = esRango(r) ? r : RANGO_POR_DEFECTO;
  const periodo = periodoDe(id, hoyIso(s.zonaHoraria));
  const reporte = await withTenant(s.tenantId, (tx) => reporteDe(tx, periodo, { finanzas: s.modulos.includes("gastos") || s.modulos.includes("ingresos"), reservas: s.modulos.includes("reservas") }), { timeoutMs: 60_000 });
  return new Response(csvDeReporte(reporte, s.tenantNombre, s.moneda), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="reporte-${id}-${periodo.hasta}.csv"`, "cache-control": "no-store" },
  });
}
