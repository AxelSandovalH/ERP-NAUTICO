import Link from "next/link";
import { getSesion, requireSesion } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, dinero, hoyIso, mesDe, sumarMeses } from "@/lib/fechas";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { ESTADOS_RESERVA, TONO_RESERVA } from "@/lib/etiquetas";
import { Card, Insignia, PageHeader, Vacio } from "@/components/ui";

export const metadata = { title: "Panel · ERP Náutico" };

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
        const [hoyRes, proximas, delMes, pagosMes] = await Promise.all([
          tx.reserva.findMany({ where: { fecha: aDate(hoy), ...activas }, orderBy: { inicioMin: "asc" }, include: { cliente: true, embarcacion: true } }),
          tx.reserva.count({ where: { fecha: { gt: aDate(hoy) }, estado: { in: ["PENDIENTE", "CONFIRMADA"] } } }),
          tx.reserva.aggregate({ where: { fecha: { gte: aDate(`${mes}-01`), lt: aDate(`${sumarMeses(mes, 1)}-01`) }, ...activas }, _sum: { totalCentavos: true }, _count: true }),
          tx.pago.aggregate({ where: { reserva: { fecha: { gte: aDate(`${mes}-01`), lt: aDate(`${sumarMeses(mes, 1)}-01`) } } }, _sum: { montoCentavos: true } }),
        ]);
        return { hoyRes, proximas, totalMes: delMes._sum.totalCentavos ?? 0, nMes: delMes._count, cobradoMes: pagosMes._sum.montoCentavos ?? 0 };
      })
    : null;
  return (
    <>
      <PageHeader titulo={`Hola, ${s.nombre.split(" ")[0]}`} sub={s.tenantNombre} />
      {aviso && AVISOS[aviso] && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{AVISOS[aviso]}</p>}
      {!datos ? <Vacio>Activa el módulo de Reservas para ver tu operación.</Vacio> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card><p className="text-sm text-muted">Salidas hoy</p><p className="mt-1 text-2xl font-semibold">{datos.hoyRes.length}</p></Card>
            <Card><p className="text-sm text-muted">Próximas confirmadas / pendientes</p><p className="mt-1 text-2xl font-semibold">{datos.proximas}</p></Card>
            <Card><p className="text-sm text-muted">Ventas del mes ({datos.nMes})</p><p className="mt-1 text-2xl font-semibold">{dinero(datos.totalMes, s.moneda)}</p></Card>
            <Card><p className="text-sm text-muted">Cobrado del mes</p><p className="mt-1 text-2xl font-semibold">{dinero(datos.cobradoMes, s.moneda)}</p></Card>
          </div>
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
