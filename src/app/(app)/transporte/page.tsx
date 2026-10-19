import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { dinero, fechaLarga, hoyIso, sumarDias, esIso } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { ESTADOS_TRASLADO, TIPOS_TRASLADO, TONO_TRASLADO } from "@/lib/transporte/horario";
import { trasladosDelDia } from "@/lib/transporte/servicio";
import { BotonLink, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Tile } from "@/components/graficas/tile";
import { SubnavTransporte } from "@/components/transporte/subnav";

export const metadata = { title: "Transporte · FleetNautic" };

export default async function TransportePage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("transporte", "transporte:ver");
  const hoy = hoyIso(s.zonaHoraria);
  const fecha = esIso(q.fecha) ? q.fecha : hoy;
  const traslados = await withTenant(s.tenantId, (tx) => trasladosDelDia(tx, fecha));
  const vivos = traslados.filter((t) => t.estado !== "CANCELADO");
  const sinAsignar = vivos.filter((t) => !t.unidadId || !t.choferId).length;
  const gestionar = puede(s.rol, "transporte:gestionar");

  return (
    <>
      <PageHeader titulo="Transporte" sub={fechaLarga(fecha)} acciones={gestionar ? <BotonLink href="/transporte/nuevo">Nuevo traslado</BotonLink> : undefined} />
      <SubnavTransporte activo="/transporte" />
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link href={`/transporte?fecha=${sumarDias(fecha, -1)}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-brand-soft" aria-label="Día anterior">←</Link>
        <Link href={`/transporte?fecha=${hoy}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-brand-soft">Hoy</Link>
        <Link href={`/transporte?fecha=${sumarDias(fecha, 1)}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-brand-soft" aria-label="Día siguiente">→</Link>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Tile etiqueta="Traslados" valor={String(vivos.length)} />
        <Tile etiqueta="Pasajeros" valor={String(vivos.reduce((a, t) => a + t.pax, 0))} />
        <Tile etiqueta="Sin unidad o chofer" valor={String(sinAsignar)} nota={sinAsignar ? "Asígnalos desde el traslado" : "Todo asignado"} />
      </div>
      {traslados.length === 0 ? <Vacio>No hay traslados este día.{gestionar && " Crea uno desde «Nuevo traslado» o desde una reserva."}</Vacio> : (
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
                <Td className="whitespace-nowrap">{t.precioCentavos ? dinero(t.precioCentavos, s.moneda) : "—"}{t.ingresoId && <span className="block text-xs text-emerald-700 dark:text-emerald-300">Cobrado</span>}</Td>
                <Td><Insignia tono={TONO_TRASLADO[t.estado]}>{ESTADOS_TRASLADO[t.estado]}</Insignia></Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
