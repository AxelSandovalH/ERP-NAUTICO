import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { CamposUbicacion } from "@/components/campos-ubicacion";
import { alternarUbicacion, eliminarUbicacion, guardarUbicacion } from "../actions";

export const metadata = { title: "Ubicaciones de asistencia · ERP Náutico" };

export default async function UbicacionesPage() {
  const s = await requireModulo("asistencia", "asistencia:administrar");
  const ubicaciones = await withTenant(s.tenantId, (tx) => tx.ubicacionAsistencia.findMany({ orderBy: { nombre: "asc" } }));
  return (
    <>
      <Link href="/asistencia" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Asistencia</Link>
      <PageHeader titulo="Ubicaciones de asistencia" sub="Solo se aceptan checadas hechas dentro del radio de alguna ubicación activa" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {ubicaciones.length === 0 ? <Vacio>Aún no hay ubicaciones: nadie podrá checar hasta que agregues una.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Nombre</Th><Th>Coordenadas</Th><Th>Radio</Th><Th>Estado</Th><Th /></tr></thead>
              <tbody>
                {ubicaciones.map((u) => (
                  <tr key={u.id}>
                    <Td className="font-medium">{u.nombre}</Td>
                    <Td className="text-xs tabular-nums">{u.lat.toFixed(5)}, {u.lng.toFixed(5)}</Td>
                    <Td>{u.radioMetros} m</Td>
                    <Td><Insignia tono={u.activa ? "verde" : "gris"}>{u.activa ? "Activa" : "Inactiva"}</Insignia></Td>
                    <Td>
                      <div className="flex gap-2">
                        <BotonAccion etiqueta={u.activa ? "Desactivar" : "Activar"} accion={alternarUbicacion.bind(null, u.id)} />
                        <BotonAccion etiqueta="Quitar" variante="peligro" confirmar="¿Quitar esta ubicación? Las checadas ya hechas se conservan." accion={eliminarUbicacion.bind(null, u.id)} />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          <p className="mt-3 text-xs text-muted">La ubicación la reporta el celular de cada persona; un GPS falsificado podría engañarla. Úsalo junto con la corrección manual de días y la revisión de un responsable.</p>
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Nueva ubicación</h2>
          <Formulario accion={guardarUbicacion} enviar="Agregar ubicación"><CamposUbicacion /></Formulario>
        </Card>
      </div>
    </>
  );
}
