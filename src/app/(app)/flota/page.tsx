import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { BotonLink, Card, Insignia, PageHeader, Vacio } from "@/components/ui";
import { urlFoto } from "@/lib/storage/reglas";
import { ESTADOS_EMBARCACION, TIPOS_EMBARCACION } from "@/lib/etiquetas";

export const metadata = { title: "Flota · FleetNautic" };

export default async function FlotaPage() {
  const s = await requireModulo("flota");
  const flota = await withTenant(s.tenantId, (tx) =>
    tx.embarcacion.findMany({ orderBy: { nombre: "asc" }, include: { _count: { select: { tarifas: true } } } }));
  return (
    <>
      <PageHeader titulo="Flota" sub={`${flota.length} embarcaciones`}
        acciones={puede(s.rol, "flota:escribir") && <BotonLink href="/flota/nueva">Nueva embarcación</BotonLink>} />
      {flota.length === 0 ? <Vacio>Aún no registras embarcaciones.</Vacio> : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-5">
          {flota.map((e) => (
            <Link key={e.id} href={`/flota/${e.id}`}>
              <Card className="h-full overflow-hidden transition hover:border-brand">
                {e.fotoRuta && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlFoto(e.fotoRuta)!} alt={e.nombre} loading="lazy" className="-mx-5 -mt-5 mb-3 aspect-[16/10] w-[calc(100%+2.5rem)] max-w-none object-cover" />
                )}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: e.color }} />
                    <h2 className="font-semibold">{e.nombre}</h2>
                  </div>
                  <Insignia tono={e.estado === "ACTIVA" ? "verde" : e.estado === "MANTENIMIENTO" ? "ambar" : "gris"}>
                    {ESTADOS_EMBARCACION[e.estado]}
                  </Insignia>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {TIPOS_EMBARCACION[e.tipo]} · hasta {e.capacidad} pax{e.esloraPies ? ` · ${e.esloraPies} ft` : ""}
                </p>
                <p className="mt-1 text-xs text-muted">{e._count.tarifas} tarifas</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
