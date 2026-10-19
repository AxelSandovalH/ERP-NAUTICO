import { requireModulo } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { Campo, Card, Input, Insignia, PageHeader, Select, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { SubnavHorarios } from "@/components/horarios/subnav";
import { alternarPersonaAccion, crearPersonaAccion, vincularUsuarioAccion } from "../actions";

export const metadata = { title: "Equipo · Horarios · FleetNautic" };

export default async function EquipoHorariosPage() {
  const s = await requireModulo("horarios", "horarios:administrar");
  const personas = await withTenant(s.tenantId, (tx) => tx.empleado.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }, { apellido: "asc" }] }));
  // Usuario es de identidad (sin RLS por empresa): se filtra por la empresa de la sesión
  const usuarios = await prisma.usuario.findMany({ where: { tenantId: s.tenantId, activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, email: true } });
  const vinculados = new Set(personas.map((p) => p.usuarioId).filter(Boolean));

  return (
    <>
      <PageHeader titulo="Equipo" sub="Las personas a las que les planeas horario" />
      <SubnavHorarios activo="/horarios/equipo" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {personas.length === 0 ? <Vacio>Aún no hay personas. Agrega a la primera.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Persona</Th><Th>Usuario para ver su horario</Th><Th /></tr></thead>
              <tbody>
                {personas.map((p) => (
                  <tr key={p.id} className={p.activo ? "" : "opacity-60"}>
                    <Td className="font-medium">{`${p.nombre} ${p.apellido}`.trim()}{p.puesto && <span className="block text-xs font-normal text-muted">{p.puesto}</span>}{!p.activo && <> <Insignia>Inactivo</Insignia></>}</Td>
                    <Td>
                      <Formulario accion={vincularUsuarioAccion.bind(null, p.id)} enviar="Guardar" className="flex flex-wrap items-center gap-2">
                        <Select name="usuarioId" defaultValue={p.usuarioId ?? ""} className="max-w-56">
                          <option value="">Sin usuario</option>
                          {usuarios.filter((u) => u.id === p.usuarioId || !vinculados.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.email}</option>)}
                        </Select>
                      </Formulario>
                    </Td>
                    <Td><BotonAccion etiqueta={p.activo ? "Desactivar" : "Activar"} confirmar={p.activo ? "Dejará de aparecer en la cuadrícula de horarios. ¿Desactivar?" : undefined} accion={alternarPersonaAccion.bind(null, p.id, !p.activo)} /></Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </div>
        <Card>
          <h2 className="mb-1 font-semibold">Agregar persona</h2>
          <p className="mb-4 text-xs text-muted">Es el mismo catálogo de Nómina y Asistencia: si más adelante usas esos módulos, solo capturas su sueldo.</p>
          <Formulario accion={crearPersonaAccion} enviar="Agregar">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Nombre"><Input name="nombre" required /></Campo>
                <Campo etiqueta="Apellido"><Input name="apellido" /></Campo>
              </div>
              <Campo etiqueta="Puesto"><Input name="puesto" placeholder="Capitán, marinero, anfitrión…" /></Campo>
              <Campo etiqueta="Usuario" ayuda="Para que vea su horario al entrar">
                <Select name="usuarioId" defaultValue="">
                  <option value="">Sin usuario</option>
                  {usuarios.filter((u) => !vinculados.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.email}</option>)}
                </Select>
              </Campo>
            </div>
          </Formulario>
        </Card>
      </div>
    </>
  );
}
