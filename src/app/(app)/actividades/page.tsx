import Link from "next/link";
import { Clock, MapPin, Users } from "lucide-react";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, aIso, dinero, hoyIso } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { urlFoto } from "@/lib/storage/reglas";
import { lugaresLibres } from "@/lib/actividades/reglas";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { BotonLink, Card, Insignia, PageHeader, Vacio } from "@/components/ui";
import { FotoAjustada } from "@/components/foto-ajustada";

export const metadata = { title: "Actividades · FleetNautic" };

export default async function ActividadesPage() {
  const s = await requireModulo("actividades", "actividades:ver");
  const hoy = hoyIso(s.zonaHoraria);
  const lista = await withTenant(s.tenantId, async (tx) => {
    const acts = await tx.actividad.findMany({ orderBy: [{ activa: "desc" }, { nombre: "asc" }] });
    const proximas = await tx.salidaActividad.findMany({
      where: { fecha: { gte: aDate(hoy) }, estado: "PROGRAMADA" }, orderBy: [{ fecha: "asc" }, { inicioMin: "asc" }], include: { reservas: { select: { pax: true, estado: true } } },
    });
    return acts.map((a) => ({ ...a, siguiente: proximas.find((x) => x.actividadId === a.id) ?? null, n: proximas.filter((x) => x.actividadId === a.id).length }));
  });
  const editar = puede(s.rol, "actividades:escribir");
  return (
    // Con pocas actividades la cuadrícula ocupa el alto de la pantalla (como Flota)
    <div className={`flex flex-col ${lista.length <= 4 ? "md:h-[calc(100dvh-3.75rem)]" : ""}`}>
      <PageHeader titulo="Actividades" sub={`${lista.length} ${lista.length === 1 ? "actividad" : "actividades"}`}
        acciones={editar && <BotonLink href="/actividades/nueva">Nueva actividad</BotonLink>} />
      {lista.length === 0 ? <Vacio>Aún no tienes actividades. {editar && "Crea la primera para empezar a programar salidas."}</Vacio> : (
        <div className={`grid min-h-0 grid-cols-1 gap-4 md:grid-cols-2 ${lista.length <= 4 ? "md:flex-1 md:grid-rows-2" : ""}`}>
          {lista.map((a) => (
            <Link key={a.id} href={`/actividades/${a.id}`} className="block min-h-0">
              <Card className={`flex h-full min-h-0 flex-col overflow-hidden transition hover:border-brand ${a.activa ? "" : "opacity-60"}`}>
                {a.fotoRuta
                  ? <FotoAjustada src={urlFoto(a.fotoRuta)!} alt={a.nombre} className={`-mx-5 -mt-5 mb-3 aspect-[2/1] w-[calc(100%+2.5rem)] ${lista.length <= 4 ? "md:aspect-auto md:h-0 md:min-h-0 md:flex-1" : ""}`} />
                  : <div className={`-mx-5 -mt-5 mb-3 flex aspect-[2/1] w-[calc(100%+2.5rem)] items-center justify-center text-sm text-white/90 ${lista.length <= 4 ? "md:aspect-auto md:h-0 md:min-h-0 md:flex-1" : ""}`} style={{ background: `linear-gradient(135deg, ${a.color}, ${a.color}99)` }}>Sin foto</div>}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: a.color }} /><h2 className="font-semibold">{a.nombre}</h2></div>
                  <span className="text-right text-lg font-semibold">{dinero(a.precioCentavos, s.moneda)}<span className="block text-[10px] font-normal text-muted">por persona</span></span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{a.duracionMin / 60} h</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />cupo {a.cupo}</span>
                  {a.puntoEncuentro && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{a.puntoEncuentro}</span>}
                </p>
                <p className="mt-1.5 text-xs text-muted">
                  {!a.activa ? <Insignia>Inactiva</Insignia> : a.siguiente
                    ? <>Próxima salida: {aIso(a.siguiente.fecha)} · {minutosAHora(a.siguiente.inicioMin)} · {lugaresLibres(a.siguiente.cupo, a.siguiente.reservas)} lugares libres · {a.n} programadas</>
                    : "Sin salidas programadas"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
