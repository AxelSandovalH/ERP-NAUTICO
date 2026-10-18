import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, fechaLarga, hoyIso } from "@/lib/fechas";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { ESTADOS_TRASLADO, TIPOS_TRASLADO, TONO_TRASLADO } from "@/lib/transporte/horario";
import { misTraslados } from "@/lib/transporte/servicio";
import { Card, Insignia, PageHeader, Vacio } from "@/components/ui";

export const metadata = { title: "Mis traslados · ERP Náutico" };
const DIAS = 7;

export default async function MisTrasladosPage() {
  const s = await requireModulo("transporte", "transporte:ver_propio");
  const hoy = hoyIso(s.zonaHoraria);
  const d = await withTenant(s.tenantId, async (tx) => {
    const yo = await tx.empleado.findFirst({ where: { usuarioId: s.usuarioId, activo: true }, select: { id: true } });
    return yo ? { traslados: await misTraslados(tx, yo.id, hoy, DIAS) } : null;
  });
  const porDia = new Map<string, NonNullable<typeof d>["traslados"]>();
  for (const t of d?.traslados ?? []) porDia.set(aIso(t.fecha), [...(porDia.get(aIso(t.fecha)) ?? []), t]);

  return (
    <>
      <PageHeader titulo="Mis traslados" sub={`Hoy y los próximos ${DIAS - 1} días`} />
      {!d ? <Vacio>Tu usuario aún no está vinculado a una persona del equipo. Pídele a un administrador que lo haga en Horarios → Equipo.</Vacio>
        : d.traslados.length === 0 ? <Vacio>No tienes traslados asignados en estos días.</Vacio> : (
          <div className="space-y-6">
            {[...porDia].map(([dia, lista]) => (
              <section key={dia}>
                <h2 className="mb-2 text-sm font-semibold capitalize">{dia === hoy ? "Hoy · " : ""}{fechaLarga(dia)}</h2>
                <ul className="space-y-3">
                  {lista.map((t) => (
                    <li key={t.id}>
                      <Card>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-lg font-semibold">{minutosAHora(t.horaMin)} <span className="text-sm font-normal text-muted">· {TIPOS_TRASLADO[t.tipo]}</span></p>
                          <Insignia tono={TONO_TRASLADO[t.estado]}>{ESTADOS_TRASLADO[t.estado]}</Insignia>
                        </div>
                        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                          <div><dt className="text-muted">Recoger en</dt><dd className="font-medium">{t.origen}</dd></div>
                          <div><dt className="text-muted">Llevar a</dt><dd className="font-medium">{t.destino}</dd></div>
                          <div><dt className="text-muted">Pasajeros</dt><dd>{t.pax}{t.unidad && ` · ${t.unidad.nombre}${t.unidad.placas ? ` (${t.unidad.placas})` : ""}`}</dd></div>
                          <div><dt className="text-muted">Cliente</dt><dd>{t.reserva.cliente.nombre}{t.reserva.cliente.telefono && <> · <a href={`tel:${t.reserva.cliente.telefono.replace(/[^+\d]/g, "")}`} className="text-brand">{t.reserva.cliente.telefono}</a></>}</dd></div>
                          <div className="sm:col-span-2"><dt className="text-muted">Salida de la reserva</dt><dd>{t.reserva.embarcacion.nombre} · {minutosAHora(t.reserva.inicioMin)}</dd></div>
                          {t.notas && <div className="sm:col-span-2"><dt className="text-muted">Notas</dt><dd>{t.notas}</dd></div>}
                        </dl>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      <p className="mt-6 text-xs text-muted"><Link href="/horarios/mio" className="text-brand">Ver mi horario</Link></p>
    </>
  );
}
