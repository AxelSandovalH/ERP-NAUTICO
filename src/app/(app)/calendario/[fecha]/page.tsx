import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { aDate, aIso, esIso, fechaLarga, mesDe, sumarDias } from "@/lib/fechas";
import { enBloqueo, minutosAHora } from "@/lib/reservas/disponibilidad";
import { ESTADOS_RESERVA } from "@/lib/etiquetas";
import { BotonLink, PageHeader, Vacio } from "@/components/ui";

const DESDE = 6 * 60, HASTA = 22 * 60; // ventana visible 06:00–22:00
const PX_POR_MIN = 0.9;

export default async function DiaPage({ params }: { params: Promise<{ fecha: string }> }) {
  const { fecha } = await params;
  if (!esIso(fecha)) notFound();
  const s = await requireModulo("calendario");
  const { flota, reservas, bloqueos } = await withTenant(s.tenantId, async (tx) => ({
    flota: await tx.embarcacion.findMany({ where: { estado: { not: "INACTIVA" } }, orderBy: { nombre: "asc" } }),
    reservas: await tx.reserva.findMany({ where: { fecha: aDate(fecha), estado: { not: "CANCELADA" } }, include: { cliente: true } }),
    bloqueos: await tx.bloqueoEmbarcacion.findMany({ where: { desde: { lte: aDate(fecha) }, hasta: { gte: aDate(fecha) } } }),
  }));
  const escribir = puede(s.rol, "reservas:escribir");
  const horas = Array.from({ length: (HASTA - DESDE) / 60 + 1 }, (_, i) => DESDE / 60 + i);
  const alto = (HASTA - DESDE) * PX_POR_MIN;
  return (
    <>
      <PageHeader titulo={fechaLarga(fecha)} sub={`${reservas.length} reservas`}
        acciones={<>
          <BotonLink variante="suave" href={`/calendario/${sumarDias(fecha, -1)}`}>←</BotonLink>
          <BotonLink variante="suave" href={`/calendario?mes=${mesDe(fecha)}`}>Mes</BotonLink>
          <BotonLink variante="suave" href={`/calendario/${sumarDias(fecha, 1)}`}>→</BotonLink>
          {escribir && <BotonLink href={`/reservas/nueva?fecha=${fecha}`}>Nueva reserva</BotonLink>}
        </>} />
      {flota.length === 0 ? <Vacio>No hay embarcaciones.</Vacio> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `56px repeat(${flota.length}, minmax(150px, 1fr))` }}>
            <div />
            {flota.map((e) => (
              <div key={e.id} className="border-l border-line px-3 py-2 text-sm font-semibold">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />{e.nombre}
              </div>
            ))}
            <div className="relative" style={{ height: alto }}>
              {horas.map((h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-xs text-muted" style={{ top: (h * 60 - DESDE) * PX_POR_MIN }}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {flota.map((e) => {
              const bloqueada = e.estado !== "ACTIVA" || bloqueos.some((b) => b.embarcacionId === e.id && enBloqueo(fecha, { desde: aIso(b.desde), hasta: aIso(b.hasta) }));
              const motivo = bloqueos.find((b) => b.embarcacionId === e.id)?.motivo ?? "Mantenimiento";
              return (
                <div key={e.id} className="relative border-l border-line" style={{ height: alto }}>
                  {horas.map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: (h * 60 - DESDE) * PX_POR_MIN }}>
                      {escribir && !bloqueada && h < HASTA / 60 && (
                        <Link href={`/reservas/nueva?fecha=${fecha}&embarcacionId=${e.id}&inicio=${String(h).padStart(2, "0")}:00`}
                          aria-label={`Reservar ${e.nombre} a las ${h}:00`} className="block opacity-0 hover:bg-brand-soft hover:opacity-100"
                          style={{ height: 60 * PX_POR_MIN }} />
                      )}
                    </div>
                  ))}
                  {bloqueada && (
                    <div className="absolute inset-0 grid place-items-center bg-slate-400/20 p-2 text-center text-xs text-muted">
                      No disponible · {motivo}
                    </div>
                  )}
                  {reservas.filter((r) => r.embarcacionId === e.id).map((r) => {
                    const top = Math.max(0, r.inicioMin - DESDE) * PX_POR_MIN;
                    const h = (Math.min(HASTA, r.finMin) - Math.max(DESDE, r.inicioMin)) * PX_POR_MIN;
                    return (
                      <Link key={r.id} href={`/reservas/${r.id}`}
                        className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-xs text-white shadow"
                        style={{ top, height: Math.max(h, 24), background: e.color, opacity: r.estado === "PENDIENTE" ? 0.75 : 1 }}>
                        <div className="font-semibold">{minutosAHora(r.inicioMin)}–{minutosAHora(r.finMin)} · #{r.folio}</div>
                        <div className="truncate">{r.cliente.nombre} · {r.pax} pax</div>
                        <div className="truncate opacity-80">{ESTADOS_RESERVA[r.estado]}</div>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
