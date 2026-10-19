import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero, fechaLarga, hoyIso, sumarDias, esIso } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { ESTADOS_TRASLADO, TIPOS_TRASLADO, TONO_TRASLADO } from "@/lib/transporte/horario";
import { trasladosAgendados, trasladosDelDia } from "@/lib/transporte/servicio";
import { BotonLink, Input, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Tile } from "@/components/graficas/tile";

export const metadata = { title: "Transporte · FleetNautic" };

const DIAS_AGENDA = 30;
type Fila = Awaited<ReturnType<typeof trasladosDelDia>>[number];

function TablaTraslados({ traslados, moneda }: { traslados: Fila[]; moneda: string }) {
  return (
    <Tabla>
      <thead><tr><Th>Hora</Th><Th>Reserva</Th><Th>Ruta</Th><Th>Pax</Th><Th>Unidad · Chofer</Th><Th>Precio</Th><Th>Estado</Th></tr></thead>
      <tbody>
        {traslados.map((t) => (
          <tr key={t.id} className={t.estado === "CANCELADO" ? "opacity-50" : "hover:bg-brand-soft/50"}>
            <Td className="whitespace-nowrap font-medium"><Link href={`/transporte/${t.id}`} className="text-brand">{minutosAHora(t.horaMin)}</Link><span className="block text-xs font-normal text-muted">{TIPOS_TRASLADO[t.tipo]}</span></Td>
            <Td><Link href={`/reservas/${t.reservaId}`} className="hover:underline">#{t.reserva.folio}</Link><span className="block text-xs text-muted">{t.reserva.cliente.nombre}</span></Td>
            <Td className="text-xs">{t.origen}<span className="block text-muted">→ {t.destino}</span></Td>
            <Td>{t.pax}</Td>
            <Td className="text-xs">{t.unidad?.nombre ?? <span className="text-amber-700 dark:text-amber-300">Sin unidad</span>}<span className="block text-muted">{t.chofer ? `${t.chofer.nombre} ${t.chofer.apellido}`.trim() : <span className="text-amber-700 dark:text-amber-300">Sin chofer</span>}</span></Td>
            <Td className="whitespace-nowrap">{t.precioCentavos ? dinero(t.precioCentavos, moneda) : "—"}{t.ingresoId && <span className="block text-xs text-emerald-700 dark:text-emerald-300">Cobrado</span>}</Td>
            <Td><Insignia tono={TONO_TRASLADO[t.estado]}>{ESTADOS_TRASLADO[t.estado]}</Insignia></Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

/** Agenda de traslados: lo de hoy primero y, debajo, los próximos días. Con `?fecha=` se ve un día en particular (también pasado). */
export default async function TransportePage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("transporte", "transporte:ver");
  const hoy = hoyIso(s.zonaHoraria);
  const gestionar = puede(s.rol, "transporte:gestionar");
  const dia = esIso(q.fecha) ? q.fecha : null;
  const nuevo = gestionar ? <BotonLink href="/transporte/nuevo">Nuevo traslado</BotonLink> : undefined;
  const sinAsignarDe = (l: Fila[]) => l.filter((t) => t.estado !== "CANCELADO" && (!t.unidadId || !t.choferId)).length;

  // Un día en particular
  if (dia) {
    const traslados = await withTenant(s.tenantId, (tx) => trasladosDelDia(tx, dia));
    const vivos = traslados.filter((t) => t.estado !== "CANCELADO");
    return (
      <>
        <PageHeader titulo="Transporte" sub={fechaLarga(dia)} acciones={nuevo} />
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Link href="/transporte" className="rounded-lg border border-line px-3 py-1.5 hover:bg-brand-soft">← Agenda</Link>
          <Link href={`/transporte?fecha=${sumarDias(dia, -1)}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-brand-soft" aria-label="Día anterior">←</Link>
          <Link href={`/transporte?fecha=${sumarDias(dia, 1)}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-brand-soft" aria-label="Día siguiente">→</Link>
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Tile etiqueta="Traslados" valor={String(vivos.length)} />
          <Tile etiqueta="Pasajeros" valor={String(vivos.reduce((a, t) => a + t.pax, 0))} />
          <Tile etiqueta="Sin unidad o chofer" valor={String(sinAsignarDe(traslados))} />
        </div>
        {traslados.length === 0 ? <Vacio>No hay traslados este día.</Vacio> : <TablaTraslados traslados={traslados} moneda={s.moneda} />}
      </>
    );
  }

  // Agenda: hoy y los próximos días
  const agenda = await withTenant(s.tenantId, (tx) => trasladosAgendados(tx, hoy, DIAS_AGENDA));
  const deHoy = agenda.filter((t) => aIso(t.fecha) === hoy);
  const proximos = new Map<string, Fila[]>();
  for (const t of agenda) { const f = aIso(t.fecha); if (f !== hoy) proximos.set(f, [...(proximos.get(f) ?? []), t]); }
  return (
    <>
      <PageHeader titulo="Transporte" sub={`Hoy, ${fechaLarga(hoy)}`} acciones={nuevo} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Tile etiqueta="Traslados hoy" valor={String(deHoy.length)} />
        <Tile etiqueta="Pasajeros hoy" valor={String(deHoy.reduce((a, t) => a + t.pax, 0))} />
        <Tile etiqueta="Sin unidad o chofer" valor={String(sinAsignarDe(agenda))} nota={sinAsignarDe(agenda) ? `En los próximos ${DIAS_AGENDA} días` : "Todo asignado"} />
      </div>

      <h2 className="mb-3 text-lg font-semibold">Hoy</h2>
      {deHoy.length === 0 ? <Vacio>No hay traslados hoy.{gestionar && " Crea uno desde «Nuevo traslado» o desde una reserva."}</Vacio> : <TablaTraslados traslados={deHoy} moneda={s.moneda} />}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Próximos días</h2>
      {proximos.size === 0 ? <Vacio>No hay traslados agendados en los próximos {DIAS_AGENDA} días.</Vacio> : (
        <div className="space-y-6">
          {[...proximos].map(([f, lista]) => (
            <section key={f}>
              <h3 className="mb-2 text-sm font-semibold capitalize text-muted">{fechaLarga(f)} · {lista.length} {lista.length === 1 ? "traslado" : "traslados"}</h3>
              <TablaTraslados traslados={lista} moneda={s.moneda} />
            </section>
          ))}
        </div>
      )}

      <form className="mt-8 flex flex-wrap items-end gap-2 text-sm" action="/transporte">
        <label className="flex items-center gap-2 text-muted">Ver otro día <Input type="date" name="fecha" required className="w-auto" /></label>
        <button className="rounded-lg border border-line px-3 py-2 hover:bg-brand-soft">Ver</button>
      </form>
    </>
  );
}
