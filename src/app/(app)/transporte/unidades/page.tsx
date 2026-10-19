import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { Campo, Card, Input, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { alternarUnidadAccion, guardarUnidadAccion } from "../actions";

export const metadata = { title: "Flota terrestre · Transporte · FleetNautic" };

function CamposUnidad({ v }: { v?: { nombre: string; placas: string | null; capacidad: number; notas: string | null } }) {
  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre"><Input name="nombre" defaultValue={v?.nombre} placeholder="Van 1" required /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Capacidad (pasajeros)"><Input type="number" name="capacidad" min={1} max={200} defaultValue={v?.capacidad} required /></Campo>
        <Campo etiqueta="Placas"><Input name="placas" defaultValue={v?.placas ?? ""} /></Campo>
      </div>
      <Campo etiqueta="Notas"><Input name="notas" defaultValue={v?.notas ?? ""} /></Campo>
    </div>
  );
}

export default async function UnidadesPage() {
  const s = await requireModulo("transporte", "transporte:ver");
  const gestionar = puede(s.rol, "transporte:gestionar");
  const unidades = await withTenant(s.tenantId, (tx) => tx.unidadTransporte.findMany({ orderBy: [{ activa: "desc" }, { nombre: "asc" }] }));
  return (
    <>
      <PageHeader titulo="Flota terrestre" sub="Camionetas y vehículos con los que haces los traslados" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {unidades.length === 0 ? <Vacio>Aún no hay unidades. Agrega la primera.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Unidad</Th><Th>Capacidad</Th><Th>Placas</Th>{gestionar && <Th />}</tr></thead>
              <tbody>
                {unidades.map((u) => (
                  <tr key={u.id} className={u.activa ? "" : "opacity-60"}>
                    <Td className="font-medium">{u.nombre}{!u.activa && <> <Insignia>Inactiva</Insignia></>}
                      {gestionar && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-normal text-brand">Editar</summary>
                          <div className="mt-3 font-normal"><Formulario accion={guardarUnidadAccion.bind(null, u.id)}><CamposUnidad v={u} /></Formulario></div>
                        </details>
                      )}
                    </Td>
                    <Td>{u.capacidad} pax</Td>
                    <Td>{u.placas ?? "—"}</Td>
                    {gestionar && <Td><BotonAccion etiqueta={u.activa ? "Desactivar" : "Activar"} accion={alternarUnidadAccion.bind(null, u.id, !u.activa)} /></Td>}
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </div>
        {gestionar && (
          <Card>
            <h2 className="mb-4 font-semibold">Nueva unidad</h2>
            <Formulario accion={guardarUnidadAccion.bind(null, null)} enviar="Crear unidad"><CamposUnidad /></Formulario>
          </Card>
        )}
      </div>
    </>
  );
}
