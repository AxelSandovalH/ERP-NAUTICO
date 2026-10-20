import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { BotonLink, Card, Insignia, PageHeader, Vacio } from "@/components/ui";
import { FotoAjustada } from "@/components/foto-ajustada";
import { urlFoto } from "@/lib/storage/reglas";
import { ESTADOS_EMBARCACION, TIPOS_EMBARCACION } from "@/lib/etiquetas";

export const metadata = { title: "Flota · FleetNautic" };

export default async function FlotaPage() {
  const s = await requireModulo("flota");
  const flota = await withTenant(s.tenantId, (tx) =>
    tx.embarcacion.findMany({ orderBy: { nombre: "asc" }, include: { _count: { select: { tarifas: true } } } }));
  return (
    // En pantallas grandes la cuadrícula ocupa exactamente el alto disponible: las fotos se ajustan para que todo quepa sin scroll
    <div className="flex flex-col md:h-[calc(100dvh-3.75rem)]">
      <PageHeader titulo="Flota" sub={`${flota.length} embarcaciones`}
        acciones={puede(s.rol, "flota:escribir") && <BotonLink href="/flota/nueva">Nueva embarcación</BotonLink>} />
      {flota.length === 0 ? <Vacio>Aún no registras embarcaciones.</Vacio> : (
        <div className="grid min-h-0 grid-cols-1 gap-4 md:flex-1 md:grid-cols-2 md:grid-rows-2">
          {flota.map((e) => (
            <Link key={e.id} href={`/flota/${e.id}`} className="block min-h-0">
              <Card className="flex h-full min-h-0 flex-col overflow-hidden transition hover:border-brand">
                {e.fotoRuta && (
                  <FotoAjustada src={urlFoto(e.fotoRuta)!} alt={e.nombre} className="-mx-5 -mt-5 mb-3 aspect-[2/1] w-[calc(100%+2.5rem)] md:aspect-auto md:h-0 md:min-h-0 md:flex-1" />
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
    </div>
  );
}
