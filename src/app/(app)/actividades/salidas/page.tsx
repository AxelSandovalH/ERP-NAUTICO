import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, fechaLarga, hoyIso } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { salidasAgenda } from "@/lib/actividades/servicio";
import { BotonLink, Insignia, PageHeader, Select, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Tile } from "@/components/graficas/tile";

export const metadata = { title: "Salidas · Actividades · FleetNautic" };

const DIAS = 30;
type Fila = Awaited<ReturnType<typeof salidasAgenda>>[number];

function Cupo({ ocupados, cupo }: { ocupados: number; cupo: number }) {
  const lleno = ocupados >= cupo;
  return (
    <div className="min-w-28">
      <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${lleno ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${Math.min(100, (ocupados / Math.max(1, cupo)) * 100)}%` }} /></div>
      <p className="mt-1 text-xs text-muted">{ocupados} de {cupo}{lleno ? " · llena" : ""}</p>
    </div>
  );
}

function TablaSalidas({ filas }: { filas: Fila[] }) {
  return (
    <Tabla>
      <thead><tr><Th>Hora</Th><Th>Actividad</Th><Th>Embarcación · Guía</Th><Th>Lugares</Th><Th>Estado</Th></tr></thead>
      <tbody>
        {filas.map((x) => (
          <tr key={x.id} className="hover:bg-brand-soft/50">
            <Td className="whitespace-nowrap font-medium"><Link href={`/actividades/salidas/${x.id}`} className="text-brand">{minutosAHora(x.inicioMin)}</Link><span className="block text-xs font-normal text-muted">a {minutosAHora(x.finMin)}</span></Td>
            <Td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: x.actividad.color }} />{x.actividad.nombre}</Td>
            <Td className="text-xs">{x.embarcacion?.nombre ?? <span className="text-muted">Sin embarcación</span>}<span className="block text-muted">{x.guia ? `${x.guia.nombre} ${x.guia.apellido}`.trim() : "Sin guía"}</span></Td>
            <Td><Cupo ocupados={x.ocupados} cupo={x.cupo} /></Td>
            <Td>{x.estado === "COMPLETADA" ? <Insignia tono="verde">Completada</Insignia> : <Insignia tono="azul">Programada</Insignia>}</Td>
          </tr>
        ))}
      </tbody>
    </Tabla>
  );
}

/** Agenda de salidas: lo de hoy primero y, debajo, los próximos días. */
export default async function SalidasPage({ searchParams }: { searchParams: Promise<{ actividad?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("actividades", "actividades:ver");
  const hoy = hoyIso(s.zonaHoraria);
  const d = await withTenant(s.tenantId, async (tx) => ({
    salidas: await salidasAgenda(tx, hoy, DIAS, { actividadId: q.actividad || undefined }),
    actividades: await tx.actividad.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
  }));
  const deHoy = d.salidas.filter((x) => aIso(x.fecha) === hoy);
  const proximos = new Map<string, Fila[]>();
  for (const x of d.salidas) { const f = aIso(x.fecha); if (f !== hoy) proximos.set(f, [...(proximos.get(f) ?? []), x]); }
  const ocupadosHoy = deHoy.reduce((a, x) => a + x.ocupados, 0), cupoHoy = deHoy.reduce((a, x) => a + x.cupo, 0);
  const llenas = d.salidas.filter((x) => x.libres === 0).length;
  const editar = puede(s.rol, "actividades:escribir");
  return (
    <>
      <PageHeader titulo="Salidas" sub={`Hoy, ${fechaLarga(hoy)}`} acciones={editar && <BotonLink href="/actividades/salidas/nueva">Programar salida</BotonLink>} />
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm" action="/actividades/salidas">
        <label className="text-muted">Actividad
          <Select name="actividad" defaultValue={q.actividad ?? ""} className="ml-2 inline-block w-auto"><option value="">Todas</option>{d.actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select>
        </label>
        <button className="rounded-lg border border-line px-3 py-2 hover:bg-brand-soft">Filtrar</button>
      </form>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Tile etiqueta="Salidas hoy" valor={String(deHoy.length)} />
        <Tile etiqueta="Lugares apartados hoy" valor={`${ocupadosHoy} de ${cupoHoy}`} />
        <Tile etiqueta={`Salidas llenas (${DIAS} días)`} valor={String(llenas)} nota={llenas ? "Sin lugares libres" : undefined} />
      </div>
      <h2 className="mb-3 text-lg font-semibold">Hoy</h2>
      {deHoy.length === 0 ? <Vacio>No hay salidas hoy.{editar && " Programa una desde «Programar salida»."}</Vacio> : <TablaSalidas filas={deHoy} />}
      <h2 className="mb-3 mt-8 text-lg font-semibold">Próximos días</h2>
      {proximos.size === 0 ? <Vacio>No hay salidas programadas en los próximos {DIAS} días.</Vacio> : (
        <div className="space-y-6">
          {[...proximos].map(([f, lista]) => (
            <section key={f}>
              <h3 className="mb-2 text-sm font-semibold capitalize text-muted">{fechaLarga(f)} · {lista.length} {lista.length === 1 ? "salida" : "salidas"}</h3>
              <TablaSalidas filas={lista} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
