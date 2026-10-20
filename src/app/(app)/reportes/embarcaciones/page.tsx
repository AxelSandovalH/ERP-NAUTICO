import { withTenant } from "@/lib/db/tenant";
import { dinero } from "@/lib/fechas";
import { contextoReporte } from "@/lib/reportes/contexto";
import { reporteDe } from "@/lib/reportes/servicio";
import { variacion } from "@/lib/reportes/agregar";
import { Card, Tabla, Td, Th, Vacio } from "@/components/ui";
import { ReportesMarco } from "@/components/reportes-marco";
import { Tile } from "@/components/graficas/tile";
import { GraficaMensual } from "@/components/graficas/grafica-mensual";
import { BarrasHorizontales } from "@/components/graficas/barras-horizontales";

export const metadata = { title: "Reporte por embarcación · FleetNautic" };
export const maxDuration = 120;

export default async function ReporteEmbarcaciones({ searchParams }: { searchParams: Promise<{ rango?: string }> }) {
  const { s, id, periodo } = await contextoReporte(searchParams, "reservas");
  const conGastos = s.modulos.includes("gastos");
  const { r, colores } = await withTenant(s.tenantId, async (tx) => ({
    r: await reporteDe(tx, periodo, { finanzas: conGastos, reservas: true }),
    colores: new Map((await tx.embarcacion.findMany({ select: { id: true, color: true } })).map((e) => [e.id, e.color])),
  }), { timeoutMs: 60_000 });
  const v = r.ventas!, m = s.moneda;
  return (
    <ReportesMarco titulo="Reporte por embarcación" base="/reportes/embarcaciones" id={id} periodo={periodo} csv>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile etiqueta={`Ventas (${v.reservas} reserva${v.reservas === 1 ? "" : "s"})`} valor={dinero(v.ventas, m)} variacion={variacion(v.ventas, v.previos.ventas)} nota={v.reservas ? `Ticket promedio ${dinero(v.ticketPromedio, m)}` : undefined} />
        <Tile etiqueta="Reservas" valor={String(v.reservas)} variacion={variacion(v.reservas, v.previos.reservas)} />
        <Tile etiqueta="Por cobrar" valor={dinero(v.porCobrar, m)} nota="Saldo de las reservas del periodo" />
        {r.finanzas && <Tile etiqueta="Utilidad de la empresa" valor={dinero(r.finanzas.utilidad, m)} nota="Ingresos − gastos" />}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Ventas por mes</h2>
          <GraficaMensual titulo="Ventas por mes" meses={periodo.meses} moneda={m} series={[{ nombre: "Ventas", valores: v.porMes, variable: "--serie-1" }]} />
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Ventas por embarcación</h2>
          <BarrasHorizontales moneda={m} items={v.porEmbarcacion.map((e) => ({ etiqueta: e.nombre, centavos: e.ventas, color: colores.get(e.id) }))} />
        </Card>
      </div>
      {v.porEmbarcacion.length === 0 ? <Vacio>No hay reservas en este periodo.</Vacio> : (
        <div>
          <h2 className="mb-1 font-semibold">Rentabilidad por embarcación</h2>
          <p className="mb-3 text-xs text-muted">Ventas de sus reservas menos los gastos que registraste a esa embarcación.{!r.finanzas && " Activa Gastos para ver el resultado."}</p>
          <Tabla>
            <thead><tr><Th>Embarcación</Th><Th>Reservas</Th><Th>Ventas</Th>{r.finanzas && <Th>Gastos</Th>}{r.finanzas && <Th>Resultado</Th>}</tr></thead>
            <tbody>
              {v.porEmbarcacion.map((e) => (
                <tr key={e.id}>
                  <Td className="font-medium"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: colores.get(e.id) }} />{e.nombre}</Td><Td>{e.reservas}</Td><Td>{dinero(e.ventas, m)}</Td>
                  {r.finanzas && <Td>{dinero(e.gastos, m)}</Td>}
                  {r.finanzas && <Td className={`font-semibold ${e.resultado < 0 ? "text-red-700 dark:text-red-300" : ""}`}>{dinero(e.resultado, m)}</Td>}
                </tr>
              ))}
            </tbody>
          </Tabla>
        </div>
      )}
      <Card>
        <h2 className="mb-3 font-semibold">Ventas por canal</h2>
        <BarrasHorizontales moneda={m} items={v.porOrigen.map((p) => ({ etiqueta: p.etiqueta, centavos: p.centavos }))} />
      </Card>
    </ReportesMarco>
  );
}
