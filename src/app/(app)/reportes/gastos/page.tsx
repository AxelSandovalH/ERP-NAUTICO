import { withTenant } from "@/lib/db/tenant";
import { dinero } from "@/lib/fechas";
import { contextoReporte } from "@/lib/reportes/contexto";
import { reporteDe } from "@/lib/reportes/servicio";
import { gastosDetalle } from "@/lib/reportes/secciones";
import { variacion } from "@/lib/reportes/agregar";
import { GRIS, colorDeCategoria } from "@/lib/finanzas/colores";
import { Card, Tabla, Td, Th, Vacio } from "@/components/ui";
import { ReportesMarco } from "@/components/reportes-marco";
import { Tile } from "@/components/graficas/tile";
import { GraficaMensual } from "@/components/graficas/grafica-mensual";
import { BarrasHorizontales } from "@/components/graficas/barras-horizontales";

export const metadata = { title: "Reporte de gastos · FleetNautic" };
export const maxDuration = 120;

export default async function ReporteGastos({ searchParams }: { searchParams: Promise<{ rango?: string }> }) {
  const { s, id, periodo } = await contextoReporte(searchParams, "gastos");
  const { r, d, colorCat } = await withTenant(s.tenantId, async (tx) => ({
    r: await reporteDe(tx, periodo, { finanzas: true, reservas: false }),
    d: await gastosDetalle(tx, periodo),
    colorCat: new Map((await tx.categoria.findMany({ select: { nombre: true, color: true } })).map((c) => [c.nombre, c.color])),
  }), { timeoutMs: 60_000 });
  const f = r.finanzas!, m = s.moneda;
  const mayorCat = f.gastosPorCategoria[0];
  return (
    <ReportesMarco titulo="Reporte de gastos" base="/reportes/gastos" id={id} periodo={periodo} csv>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile etiqueta="Gastos" valor={dinero(f.totalGastos, m)} variacion={variacion(f.totalGastos, f.previos.gastos)} subeEsBueno={false} />
        <Tile etiqueta="Número de gastos" valor={String(d.cantidad)} />
        <Tile etiqueta="Promedio por gasto" valor={dinero(d.cantidad ? Math.round(f.totalGastos / d.cantidad) : 0, m)} />
        <Tile etiqueta="Categoría más alta" valor={mayorCat ? mayorCat.etiqueta : "—"} nota={mayorCat ? dinero(mayorCat.centavos, m) : undefined} />
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Gastos por mes</h2>
        <GraficaMensual titulo="Gastos por mes" meses={periodo.meses} moneda={m} series={[{ nombre: "Gastos", valores: f.gastos, variable: "--serie-2" }]} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Gastos por categoría</h2>
          <BarrasHorizontales moneda={m} items={f.gastosPorCategoria.map((p) => ({ etiqueta: p.etiqueta, centavos: p.centavos, color: p.etiqueta === "Otras" ? GRIS : colorDeCategoria(p.etiqueta, colorCat.get(p.etiqueta)) }))} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Gastos por embarcación</h2>
          <BarrasHorizontales moneda={m} items={d.porEmbarcacion.map((p) => ({ etiqueta: p.etiqueta, centavos: p.centavos }))} />
        </Card>
      </div>
      <div>
        <h2 className="mb-3 font-semibold">Los gastos más grandes</h2>
        {d.mayores.length === 0 ? <Vacio>No hay gastos en este periodo.</Vacio> : (
          <Tabla>
            <thead><tr><Th>Fecha</Th><Th>Concepto</Th><Th>Categoría · proveedor</Th><Th>Monto</Th></tr></thead>
            <tbody>
              {d.mayores.map((g) => <tr key={g.id}><Td className="whitespace-nowrap">{g.fecha}</Td><Td className="font-medium">{g.concepto}</Td><Td className="text-xs">{g.detalle || "—"}</Td><Td className="whitespace-nowrap font-medium">{dinero(g.centavos, m)}</Td></tr>)}
            </tbody>
          </Tabla>
        )}
      </div>
    </ReportesMarco>
  );
}
