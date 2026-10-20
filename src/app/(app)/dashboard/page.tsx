import Link from "next/link";
import { getSesion, requireSesion } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, dinero, hoyIso, mesDe, sumarMeses } from "@/lib/fechas";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { ESTADOS_RESERVA, TONO_RESERVA } from "@/lib/etiquetas";
import { Card, Insignia, PageHeader, Vacio } from "@/components/ui";
import { puede } from "@/modules/permisos";
import { periodoDe } from "@/lib/reportes/rangos";
import { reporteDe } from "@/lib/reportes/servicio";
import { variacion } from "@/lib/reportes/agregar";
import { Tile } from "@/components/graficas/tile";
import { GraficaMensual } from "@/components/graficas/grafica-mensual";
import { BarrasHorizontales } from "@/components/graficas/barras-horizontales";
import { GRIS, colorDeCategoria } from "@/lib/finanzas/colores";
import { contarPorReabastecer } from "@/lib/inventario/servicio";

export const metadata = { title: "Dashboard · FleetNautic" };

const AVISOS: Record<string, string> = {
  "modulo-no-disponible": "Ese módulo no está activo en tu plan.",
  "sin-permiso": "Tu rol no tiene permiso para esa acción.",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  await requireSesion();
  const s = (await getSesion())!;
  const hoy = hoyIso(s.zonaHoraria);
  const mes = mesDe(hoy);
  const tieneReservas = s.modulos.includes("reservas");
  const datos = tieneReservas
    ? await withTenant(s.tenantId, async (tx) => {
        const activas = { estado: { not: "CANCELADA" as const } };
        const rangoMes = { gte: aDate(`${mes}-01`), lt: aDate(`${sumarMeses(mes, 1)}-01`) };
        // Secuencial: una transacción usa un solo cliente de pg
        const hoyRes = await tx.reserva.findMany({ where: { fecha: aDate(hoy), ...activas }, orderBy: { inicioMin: "asc" }, include: { cliente: true, embarcacion: true } });
        const proximas = await tx.reserva.count({ where: { fecha: { gt: aDate(hoy) }, estado: { in: ["PENDIENTE", "CONFIRMADA"] } } });
        const delMes = await tx.reserva.aggregate({ where: { fecha: rangoMes, ...activas }, _sum: { totalCentavos: true }, _count: true });
        const pagosMes = await tx.pago.aggregate({ where: { reserva: { fecha: rangoMes } }, _sum: { montoCentavos: true } });
        return { hoyRes, proximas, totalMes: delMes._sum.totalCentavos ?? 0, nMes: delMes._count, cobradoMes: pagosMes._sum.montoCentavos ?? 0 };
      })
    : null;
  // Resumen financiero del mes (solo con el módulo de reportes); se calcula aparte para no encarecer a quien no lo tiene
  const verReportes = s.modulos.includes("reportes") && (s.modulos.includes("gastos") || s.modulos.includes("ingresos"));
  const fin = verReportes ? (await withTenant(s.tenantId, (tx) => reporteDe(tx, periodoDe("este_mes", hoy), { finanzas: true, reservas: false }))).finanzas : null;
  // Gráficas de los últimos 6 meses (requieren el módulo de reportes)
  const verFinanzas = s.modulos.includes("gastos") || s.modulos.includes("ingresos");
  const graficas = s.modulos.includes("reportes") && (verFinanzas || tieneReservas)
    ? await withTenant(s.tenantId, async (tx) => {
        const periodo = periodoDe("seis_meses", hoy);
        const rep = await reporteDe(tx, periodo, { finanzas: verFinanzas, reservas: tieneReservas });
        const cats = await tx.categoria.findMany({ select: { nombre: true, color: true } });
        const flota = await tx.embarcacion.findMany({ select: { id: true, color: true } });
        return { rep, periodo, colorCat: new Map(cats.map((c) => [c.nombre, c.color])), colorEmb: new Map(flota.map((e) => [e.id, e.color])) };
      }, { timeoutMs: 60_000 })
    : null;
  const verInventario = s.modulos.includes("inventario") && puede(s.rol, "inventario:ver");
  const porReabastecer = verInventario ? await withTenant(s.tenantId, (tx) => contarPorReabastecer(tx)) : 0;
  return (
    <>
      <PageHeader titulo={`Hola, ${s.nombre.split(" ")[0]}`} sub={s.tenantNombre} />
      {porReabastecer > 0 && <p role="status" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">Hay {porReabastecer} artículo{porReabastecer === 1 ? "" : "s"} de inventario por debajo de su mínimo. <Link href="/inventario" className="font-medium underline">Ver inventario</Link></p>}
      {aviso && AVISOS[aviso] && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{AVISOS[aviso]}</p>}
      {!datos ? <Vacio>{s.prueba?.vencida ? "Tu prueba gratuita terminó. Elige un plan en Configuración para reactivar tus módulos." : "Activa el módulo de Reservas para ver tu operación."}</Vacio> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card><p className="text-sm text-muted">Salidas hoy</p><p className="mt-1 text-2xl font-semibold">{datos.hoyRes.length}</p></Card>
            <Card><p className="text-sm text-muted">Próximas confirmadas / pendientes</p><p className="mt-1 text-2xl font-semibold">{datos.proximas}</p></Card>
            <Card><p className="text-sm text-muted">Ventas del mes ({datos.nMes})</p><p className="mt-1 text-2xl font-semibold">{dinero(datos.totalMes, s.moneda)}</p></Card>
            <Card><p className="text-sm text-muted">Cobrado del mes</p><p className="mt-1 text-2xl font-semibold">{dinero(datos.cobradoMes, s.moneda)}</p></Card>
          </div>
          {fin && (
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <Tile etiqueta="Ingresos del mes" valor={dinero(fin.totalIngresos, s.moneda)} variacion={variacion(fin.totalIngresos, fin.previos.ingresos)} />
              <Tile etiqueta="Gastos del mes" valor={dinero(fin.totalGastos, s.moneda)} variacion={variacion(fin.totalGastos, fin.previos.gastos)} subeEsBueno={false} />
              <Tile etiqueta="Utilidad del mes" valor={dinero(fin.utilidad, s.moneda)} nota="Ver detalle en Reportes" />
            </div>
          )}
          {graficas && (
            <div className="mb-6 grid gap-6 lg:grid-cols-2">
              {graficas.rep.finanzas && (
                <Card>
                  <h2 className="mb-3 font-semibold">Ingresos y gastos por mes</h2>
                  <GraficaMensual titulo="Ingresos y gastos por mes" meses={graficas.periodo.meses} moneda={s.moneda} series={[
                    { nombre: "Ingresos", valores: graficas.rep.finanzas.ingresos, variable: "--serie-1" },
                    { nombre: "Gastos", valores: graficas.rep.finanzas.gastos, variable: "--serie-2" },
                  ]} />
                </Card>
              )}
              {graficas.rep.ventas && (
                <Card>
                  <h2 className="mb-3 font-semibold">Ventas por mes</h2>
                  <GraficaMensual titulo="Ventas por mes" meses={graficas.periodo.meses} moneda={s.moneda} series={[{ nombre: "Ventas", valores: graficas.rep.ventas.porMes, variable: "--serie-1" }]} />
                </Card>
              )}
              {graficas.rep.finanzas && (
                <Card>
                  <h2 className="mb-3 font-semibold">Gastos por categoría</h2>
                  <BarrasHorizontales moneda={s.moneda} items={graficas.rep.finanzas.gastosPorCategoria.map((p) => ({ etiqueta: p.etiqueta, centavos: p.centavos, color: p.etiqueta === "Otras" ? GRIS : colorDeCategoria(p.etiqueta, graficas.colorCat.get(p.etiqueta)) }))} />
                </Card>
              )}
              {graficas.rep.ventas && graficas.rep.ventas.porEmbarcacion.length > 0 && (
                <Card>
                  <h2 className="mb-3 font-semibold">Ventas por embarcación</h2>
                  <BarrasHorizontales moneda={s.moneda} items={graficas.rep.ventas.porEmbarcacion.map((e) => ({ etiqueta: e.nombre, centavos: e.ventas, color: graficas.colorEmb.get(e.id) }))} />
                </Card>
              )}
            </div>
          )}
          <Card>
            <h2 className="mb-3 font-semibold">Salidas de hoy</h2>
            {datos.hoyRes.length === 0 ? <p className="text-sm text-muted">Sin salidas programadas.</p> : (
              <ul className="divide-y divide-line">
                {datos.hoyRes.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <Link href={`/reservas/${r.id}`} className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.embarcacion.color }} />
                      <span className="font-medium">{minutosAHora(r.inicioMin)}–{minutosAHora(r.finMin)}</span>
                      <span>{r.embarcacion.nombre}</span>
                      <span className="text-muted">{r.cliente.nombre} · {r.pax} pax</span>
                    </Link>
                    <Insignia tono={TONO_RESERVA[r.estado]}>{ESTADOS_RESERVA[r.estado]}</Insignia>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
