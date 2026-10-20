import { withTenant } from "@/lib/db/tenant";
import { dinero } from "@/lib/fechas";
import { contextoReporte } from "@/lib/reportes/contexto";
import { reporteDe } from "@/lib/reportes/servicio";
import { ingresosDetalle } from "@/lib/reportes/secciones";
import { variacion } from "@/lib/reportes/agregar";
import { GRIS, colorDeCategoria } from "@/lib/finanzas/colores";
import { Card, Tabla, Td, Th, Vacio } from "@/components/ui";
import { ReportesMarco } from "@/components/reportes-marco";
import { Tile } from "@/components/graficas/tile";
import { GraficaMensual } from "@/components/graficas/grafica-mensual";
import { BarrasHorizontales } from "@/components/graficas/barras-horizontales";

export const metadata = { title: "Reporte de ingresos · FleetNautic" };
export const maxDuration = 120;

export default async function ReporteIngresos({ searchParams }: { searchParams: Promise<{ rango?: string }> }) {
  const { s, id, periodo } = await contextoReporte(searchParams, "ingresos");
  const { r, d, colorCat } = await withTenant(s.tenantId, async (tx) => ({
    r: await reporteDe(tx, periodo, { finanzas: true, reservas: false }),
    d: await ingresosDetalle(tx, periodo),
    colorCat: new Map((await tx.categoria.findMany({ select: { nombre: true, color: true } })).map((c) => [c.nombre, c.color])),
  }), { timeoutMs: 60_000 });
  const f = r.finanzas!, m = s.moneda;
  return (
    <ReportesMarco titulo="Reporte de ingresos" base="/reportes/ingresos" id={id} periodo={periodo} csv>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile etiqueta="Ingresos" valor={dinero(f.totalIngresos, m)} variacion={variacion(f.totalIngresos, f.previos.ingresos)} />
        <Tile etiqueta="Número de ingresos" valor={String(d.cantidad)} />
        <Tile etiqueta="Promedio por ingreso" valor={dinero(d.cantidad ? Math.round(f.totalIngresos / d.cantidad) : 0, m)} />
        <Tile etiqueta="Utilidad" valor={dinero(f.utilidad, m)} variacion={variacion(f.utilidad, f.previos.ingresos - f.previos.gastos)} nota="Ingresos − gastos" />
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Ingresos por mes</h2>
        <GraficaMensual titulo="Ingresos por mes" meses={periodo.meses} moneda={m} series={[{ nombre: "Ingresos", valores: f.ingresos, variable: "--serie-1" }]} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-semibold">Por categoría</h2>
          <BarrasHorizontales moneda={m} items={f.ingresosPorCategoria.map((p) => ({ etiqueta: p.etiqueta, centavos: p.centavos, color: p.etiqueta === "Otras" ? GRIS : colorDeCategoria(p.etiqueta, colorCat.get(p.etiqueta)) }))} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Por origen</h2>
          <BarrasHorizontales moneda={m} items={d.porOrigen.map((p) => ({ etiqueta: p.etiqueta, centavos: p.centavos }))} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Por cuenta</h2>
          <BarrasHorizontales moneda={m} items={d.porCuenta.map((p) => ({ etiqueta: p.etiqueta, centavos: p.centavos }))} />
        </Card>
      </div>
      <div>
        <h2 className="mb-3 font-semibold">Los ingresos más grandes</h2>
        {d.mayores.length === 0 ? <Vacio>No hay ingresos en este periodo.</Vacio> : (
          <Tabla>
            <thead><tr><Th>Fecha</Th><Th>Concepto</Th><Th>Categoría · cuenta</Th><Th>Monto</Th></tr></thead>
            <tbody>
              {d.mayores.map((g) => <tr key={g.id}><Td className="whitespace-nowrap">{g.fecha}</Td><Td className="font-medium">{g.concepto}</Td><Td className="text-xs">{g.detalle || "—"}</Td><Td className="whitespace-nowrap font-medium">{dinero(g.centavos, m)}</Td></tr>)}
            </tbody>
          </Tabla>
        )}
      </div>
    </ReportesMarco>
  );
}
