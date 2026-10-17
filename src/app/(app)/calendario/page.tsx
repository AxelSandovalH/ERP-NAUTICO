import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, diasDelMes, hoyIso, mesDe, nombreMes, offsetInicioMes, sumarMeses } from "@/lib/fechas";
import { BotonLink, PageHeader } from "@/components/ui";
import { puede } from "@/modules/permisos";

export const metadata = { title: "Calendario · ERP Náutico" };

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams;
  const s = await requireModulo("calendario");
  const hoy = hoyIso(s.zonaHoraria);
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : mesDe(hoy);
  const n = diasDelMes(mes);
  const reservas = await withTenant(s.tenantId, (tx) =>
    tx.reserva.findMany({
      where: { fecha: { gte: aDate(`${mes}-01`), lte: aDate(`${mes}-${String(n).padStart(2, "0")}`) }, estado: { not: "CANCELADA" } },
      select: { fecha: true, embarcacion: { select: { color: true } } },
    }));
  const porDia = new Map<string, string[]>();
  for (const r of reservas) {
    const k = r.fecha.toISOString().slice(0, 10);
    porDia.set(k, [...(porDia.get(k) ?? []), r.embarcacion.color]);
  }
  const celdas: (number | null)[] = [...Array(offsetInicioMes(mes)).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  return (
    <>
      <PageHeader titulo={nombreMes(mes)} sub="Reservas activas por día"
        acciones={<>
          <BotonLink variante="suave" href={`/calendario?mes=${sumarMeses(mes, -1)}`}>←</BotonLink>
          <BotonLink variante="suave" href={`/calendario?mes=${mesDe(hoy)}`}>Hoy</BotonLink>
          <BotonLink variante="suave" href={`/calendario?mes=${sumarMeses(mes, 1)}`}>→</BotonLink>
          {puede(s.rol, "reservas:escribir") && <BotonLink href="/reservas/nueva">Nueva reserva</BotonLink>}
        </>} />
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line text-sm">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <div key={d} className="bg-surface px-2 py-2 text-center text-xs font-semibold uppercase text-muted">{d}</div>
        ))}
        {celdas.map((dia, i) => {
          if (!dia) return <div key={i} className="min-h-20 bg-surface/60" />;
          const iso = `${mes}-${String(dia).padStart(2, "0")}`;
          const colores = porDia.get(iso) ?? [];
          return (
            <Link key={i} href={`/calendario/${iso}`}
              className={`min-h-20 bg-surface p-2 transition hover:bg-brand-soft ${iso === hoy ? "ring-2 ring-inset ring-brand" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{dia}</span>
                {colores.length > 0 && <span className="text-xs text-muted">{colores.length}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {colores.slice(0, 8).map((c, j) => <span key={j} className="h-2 w-2 rounded-full" style={{ background: c }} />)}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
