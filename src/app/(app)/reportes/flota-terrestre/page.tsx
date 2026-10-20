import { withTenant } from "@/lib/db/tenant";
import { dinero } from "@/lib/fechas";
import { contextoReporte } from "@/lib/reportes/contexto";
import { reporteTransporte, type FilaRecurso } from "@/lib/reportes/secciones";
import { variacion } from "@/lib/reportes/agregar";
import { Card, Tabla, Td, Th, Vacio } from "@/components/ui";
import { ReportesMarco } from "@/components/reportes-marco";
import { Tile } from "@/components/graficas/tile";
import { GraficaMensual } from "@/components/graficas/grafica-mensual";
import { BarrasHorizontales } from "@/components/graficas/barras-horizontales";

export const metadata = { title: "Reporte de flota terrestre · FleetNautic" };
export const maxDuration = 120;

export default async function ReporteFlotaTerrestre({ searchParams }: { searchParams: Promise<{ rango?: string }> }) {
  const { s, id, periodo } = await contextoReporte(searchParams, "transporte");
  const t = await withTenant(s.tenantId, (tx) => reporteTransporte(tx, periodo), { timeoutMs: 60_000 });
  const m = s.moneda;
  const tabla = (titulo: string, filas: FilaRecurso[]) => (
    <div>
      <h2 className="mb-3 font-semibold">{titulo}</h2>
      {filas.length === 0 ? <Vacio>Sin traslados en este periodo.</Vacio> : (
        <Tabla>
          <thead><tr><Th>{titulo.includes("unidad") ? "Unidad" : "Chofer"}</Th><Th>Traslados</Th><Th>Pasajeros</Th><Th>Ventas</Th><Th>Gastos</Th><Th>Resultado</Th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave}>
                <Td className="font-medium">{f.nombre}</Td><Td>{f.traslados}</Td><Td>{f.pax}</Td><Td>{dinero(f.ventas, m)}</Td><Td>{dinero(f.gastos, m)}</Td>
                <Td className={`font-semibold ${f.ventas - f.gastos < 0 ? "text-red-700 dark:text-red-300" : ""}`}>{dinero(f.ventas - f.gastos, m)}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
  return (
    <ReportesMarco titulo="Reporte de flota terrestre" base="/reportes/flota-terrestre" id={id} periodo={periodo}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile etiqueta="Traslados" valor={String(t.traslados)} variacion={variacion(t.traslados, t.previos.traslados)} nota={`${t.pax} pasajeros`} />
        <Tile etiqueta="Ventas de traslados" valor={dinero(t.ventas, m)} variacion={variacion(t.ventas, t.previos.ventas)} nota={`Cobrado ${dinero(t.cobrado, m)}`} />
        <Tile etiqueta="Gastos de traslados" valor={dinero(t.gastos, m)} subeEsBueno={false} nota="Gasolina, casetas, transportistas" />
        <Tile etiqueta="Resultado" valor={dinero(t.resultado, m)} nota="Ventas − gastos ligados" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Ventas de traslados por mes</h2>
          <GraficaMensual titulo="Ventas de traslados por mes" meses={periodo.meses} moneda={m} series={[{ nombre: "Ventas", valores: t.porMes, variable: "--serie-1" }]} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Ventas por unidad</h2>
          <BarrasHorizontales moneda={m} items={t.porUnidad.map((f) => ({ etiqueta: f.nombre, centavos: f.ventas }))} />
        </Card>
      </div>
      {tabla("Rendimiento por unidad", t.porUnidad)}
      {tabla("Rendimiento por chofer", t.porChofer)}
    </ReportesMarco>
  );
}
