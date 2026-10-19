import Link from "next/link";
import type { RolTripulante } from "@prisma/client";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { ROLES_TRIPULANTE } from "@/lib/etiquetas";
import { BotonLink, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";

export const metadata = { title: "Equipo · FleetNautic" };

export default async function TripulacionPage({ searchParams }: { searchParams: Promise<{ rol?: string; inactivos?: string }> }) {
  const sp = await searchParams;
  const s = await requireModulo("tripulacion");
  const rol = sp.rol && sp.rol in ROLES_TRIPULANTE ? (sp.rol as RolTripulante) : undefined;
  const verInactivos = sp.inactivos === "1";
  const gente = await withTenant(s.tenantId, (tx) =>
    tx.tripulante.findMany({
      where: { ...(rol ? { rol } : {}), ...(verInactivos ? {} : { activo: true }) },
      orderBy: [{ rol: "asc" }, { nombre: "asc" }],
      include: { embarcaciones: { include: { embarcacion: { select: { nombre: true, color: true } } } } },
    }));
  return (
    <>
      <PageHeader titulo="Equipo" sub={`${gente.length} personas`}
        acciones={puede(s.rol, "tripulacion:escribir") && <BotonLink href="/tripulacion/nuevo">Nuevo tripulante</BotonLink>} />
      <form className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">Rol
          <select name="rol" defaultValue={rol ?? ""} className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2">
            <option value="">Todos</option>
            {Object.entries(ROLES_TRIPULANTE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="inactivos" value="1" defaultChecked={verInactivos} /> Incluir inactivos</label>
        <button className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-brand-soft">Filtrar</button>
      </form>
      {gente.length === 0 ? <Vacio>No hay tripulantes con estos filtros.</Vacio> : (
        <Tabla>
          <thead><tr><Th>Nombre</Th><Th>Rol</Th><Th>Embarcaciones fijas</Th><Th>Contacto</Th><Th>Estado</Th></tr></thead>
          <tbody>
            {gente.map((t) => (
              <tr key={t.id} className="hover:bg-brand-soft/50">
                <Td><Link href={`/tripulacion/${t.id}`} className="font-medium text-brand">{t.nombre} {t.apellido}</Link></Td>
                <Td>{ROLES_TRIPULANTE[t.rol]}</Td>
                <Td>
                  {t.embarcaciones.length === 0 ? "—" : t.embarcaciones.map((x) => (
                    <span key={x.embarcacionId} className="mr-2 inline-flex items-center gap-1 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: x.embarcacion.color }} />{x.embarcacion.nombre}
                    </span>
                  ))}
                </Td>
                <Td>{t.telefono ?? t.email ?? "—"}</Td>
                <Td><Insignia tono={t.activo ? "verde" : "gris"}>{t.activo ? "Activo" : "Inactivo"}</Insignia></Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
