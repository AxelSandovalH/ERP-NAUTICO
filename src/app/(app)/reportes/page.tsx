import Link from "next/link";
import { GRIS, colorDeCategoria } from "@/lib/finanzas/colores";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { dinero, hoyIso } from "@/lib/fechas";
import { RANGOS, RANGO_POR_DEFECTO, esRango, periodoDe, type RangoId } from "@/lib/reportes/rangos";
import { reporteDe } from "@/lib/reportes/servicio";
import { variacion } from "@/lib/reportes/agregar";
import { BotonLink, Card, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Tile } from "@/components/graficas/tile";
import { GraficaMensual } from "@/components/graficas/grafica-mensual";
import { BarrasHorizontales } from "@/components/graficas/barras-horizontales";

export const metadata = { title: "Reportes · FleetNautic" };
export const maxDuration = 120;

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ rango?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("reportes", "reportes:ver");
  const id: RangoId = esRango(q.rango) ? q.rango : RANGO_POR_DEFECTO;
  const periodo = periodoDe(id, hoyIso(s.zonaHoraria));
  const finanzas = s.modulos.includes("gastos") || s.modulos.includes("ingresos"), reservas = s.modulos.includes("reservas");
  const r = await withTenant(s.tenantId, (tx) => reporteDe(tx, periodo, { finanzas, reservas }), { timeoutMs: 60_000 });
  const m = s.moneda, f = r.finanzas, v = r.ventas;
  const coloresCat = f ? new Map((await withTenant(s.tenantId, (tx) => tx.categoria.findMany({ select: { nombre: true, color: true } }))).map((c) => [c.nombre, c.color])) : new Map<string, string | null>();
  const conColor = (l: { etiqueta: string; centavos: number }[]) => l.map((p) => ({ etiqueta: p.etiqueta, centavos: p.centavos, color: p.etiqueta === "Otras" ? GRIS : colorDeCategoria(p.etiqueta, coloresCat.get(p.etiqueta)) }));

  return (
    <>
      <PageHeader titulo="Reportes" sub={`${periodo.etiqueta} · ${periodo.desde} a ${periodo.hasta}`} acciones={(f || v) ? <BotonLink href={`/reportes/exportar?rango=${id}`} variante="suave">Descargar CSV</BotonLink> : undefined} />

      {/* Un solo renglón de filtros sobre todo lo que gobiernan */}
      <nav aria-label="Periodo" className="mb-6 flex flex-wrap gap-2 text-sm">
        {(Object.keys(RANGOS) as RangoId[]).map((k) => (
          <Link key={k} href={`/reportes?rango=${k}`} aria-current={k === id ? "true" : undefined} className={`rounded-full border px-3 py-1 ${k === id ? "border-brand bg-brand-soft font-medium" : "border-line hover:bg-brand-soft/50"}`}>{RANGOS[k]}</Link>
        ))}
      </nav>

      {!f && !v ? <Vacio>Activa Reservas, Ingresos o Gastos para ver tus reportes.</Vacio> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {f && <Tile etiqueta="Ingresos" valor={dinero(f.totalIngresos, m)} variacion={variacion(f.totalIngresos, f.previos.ingresos)} />}
            {f && <Tile etiqueta="Gastos" valor={dinero(f.totalGastos, m)} variacion={variacion(f.totalGastos, f.previos.gastos)} subeEsBueno={false} />}
            {f && <Tile etiqueta="Utilidad" valor={dinero(f.utilidad, m)} variacion={variacion(f.utilidad, f.previos.ingresos - f.previos.gastos)} nota="Ingresos − gastos" />}
            {v && <Tile etiqueta={`Ventas (${v.reservas} reserva${v.reservas === 1 ? "" : "s"})`} valor={dinero(v.ventas, m)} variacion={variacion(v.ventas, v.previos.ventas)} nota={v.reservas ? `Ticket promedio ${dinero(v.ticketPromedio, m)}` : undefined} />}
            {v && <Tile etiqueta="Por cobrar" valor={dinero(v.porCobrar, m)} nota="Saldo de las reservas del periodo" />}
          </div>

          {f && (
            <Card>
              <h2 className="mb-3 font-semibold">Ingresos y gastos por mes</h2>
              <GraficaMensual titulo="Ingresos y gastos por mes" meses={periodo.meses} moneda={m} series={[
                { nombre: "Ingresos", valores: f.ingresos, variable: "--serie-1" },
                { nombre: "Gastos", valores: f.gastos, variable: "--serie-2" },
              ]} />
            </Card>
          )}
          {v && (
            <Card>
              <h2 className="mb-3 font-semibold">Ventas por mes</h2>
              <p className="-mt-2 mb-3 text-xs text-muted">Reservas no canceladas, por fecha de la salida.</p>
              <GraficaMensual titulo="Ventas por mes" meses={periodo.meses} moneda={m} series={[{ nombre: "Ventas", valores: v.porMes, variable: "--serie-1" }]} />
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {f && <Card><h2 className="mb-3 font-semibold">Gastos por categoría</h2><BarrasHorizontales items={conColor(f.gastosPorCategoria)} moneda={m} /></Card>}
            {f && <Card><h2 className="mb-3 font-semibold">Ingresos por categoría</h2><BarrasHorizontales items={conColor(f.ingresosPorCategoria)} moneda={m} /></Card>}
            {v && <Card><h2 className="mb-3 font-semibold">Ventas por canal</h2><BarrasHorizontales items={v.porOrigen.map((p) => ({ etiqueta: p.etiqueta, centavos: p.centavos }))} moneda={m} /></Card>}
          </div>

          {v && v.porEmbarcacion.length > 0 && (
            <div>
              <h2 className="mb-1 font-semibold">Rentabilidad por embarcación</h2>
              <p className="mb-3 text-xs text-muted">Ventas de sus reservas menos los gastos que registraste a esa embarcación.{!f && " Activa Gastos para ver el resultado."}</p>
              <Tabla>
                <thead><tr><Th>Embarcación</Th><Th>Reservas</Th><Th>Ventas</Th>{f && <Th>Gastos</Th>}{f && <Th>Resultado</Th>}</tr></thead>
                <tbody>
                  {v.porEmbarcacion.map((e) => (
                    <tr key={e.id}>
                      <Td className="font-medium">{e.nombre}</Td><Td>{e.reservas}</Td><Td>{dinero(e.ventas, m)}</Td>
                      {f && <Td>{dinero(e.gastos, m)}</Td>}
                      {f && <Td className={`font-semibold ${e.resultado < 0 ? "text-red-700 dark:text-red-300" : ""}`}>{dinero(e.resultado, m)}</Td>}
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </div>
          )}
        </div>
      )}
    </>
  );
}
