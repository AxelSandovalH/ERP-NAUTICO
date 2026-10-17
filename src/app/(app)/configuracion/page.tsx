import { prisma } from "@/lib/db/client";
import { requireSesion } from "@/lib/auth/session";
import { puede } from "@/modules/permisos";
import { redirect } from "next/navigation";
import { MODULOS, MODULOS_POR_PLAN, type ModuloId } from "@/modules/registry";
import { ROLES } from "@/lib/etiquetas";
import { Campo, Card, Input, Insignia, PageHeader, Select, Tabla, Td, Th } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { alternarUsuario, crearUsuario, guardarModulos } from "./actions";

export const metadata = { title: "Configuración · ERP Náutico" };

export default async function ConfiguracionPage() {
  const s = await requireSesion();
  if (!puede(s.rol, "usuarios:administrar")) redirect("/dashboard?aviso=sin-permiso");
  const [tenant, usuarios] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: s.tenantId } }),
    prisma.usuario.findMany({ where: { tenantId: s.tenantId }, orderBy: { creadoEn: "asc" } }),
  ]);
  const incluidos = MODULOS_POR_PLAN[tenant.plan];
  return (
    <>
      <PageHeader titulo="Configuración" sub={`Plan ${tenant.plan.toLowerCase()}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-semibold">Módulos</h2>
          <p className="mb-4 text-sm text-muted">Activa o desactiva los módulos incluidos en tu plan. Los que dependen de otros se apagan solos.</p>
          <Formulario accion={guardarModulos}>
            <ul className="space-y-3">
              {(Object.values(MODULOS)).filter((m) => m.id !== "nucleo" && !m.implicito).map((m) => {
                const enPlan = incluidos.includes(m.id as ModuloId);
                return (
                  <li key={m.id}>
                    <label className={`flex items-start gap-3 text-sm ${enPlan ? "" : "opacity-50"}`}>
                      <input type="checkbox" name="modulo" value={m.id} defaultChecked={s.modulos.includes(m.id)} disabled={!enPlan} className="mt-1" />
                      <span>
                        <span className="font-medium">{m.nombre}</span>{!enPlan && <Insignia>No incluido en tu plan</Insignia>}
                        <span className="block text-muted">{m.descripcion}</span>
                        {m.requiere.length > 0 && <span className="block text-xs text-muted">Requiere: {m.requiere.map((r) => MODULOS[r].nombre).join(", ")}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Formulario>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Usuarios</h2>
          <Tabla>
            <thead><tr><Th>Nombre</Th><Th>Rol</Th><Th /></tr></thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <Td>{u.nombre}<span className="block text-xs text-muted">{u.email}</span></Td>
                  <Td>{ROLES[u.rol]}{!u.activo && <> <Insignia tono="rojo">Inactivo</Insignia></>}</Td>
                  <Td>{u.id !== s.usuarioId && <BotonAccion accion={alternarUsuario.bind(null, u.id)} etiqueta={u.activo ? "Desactivar" : "Activar"} />}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <h3 className="mb-3 mt-6 text-sm font-semibold">Agregar usuario</h3>
          <Formulario accion={crearUsuario} enviar="Crear usuario" className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre"><Input name="nombre" required /></Campo>
            <Campo etiqueta="Correo"><Input name="email" type="email" required /></Campo>
            <Campo etiqueta="Contraseña inicial"><Input name="password" type="password" minLength={8} required /></Campo>
            <Campo etiqueta="Rol"><Select name="rol" defaultValue="VENDEDOR">{Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Campo>
          </Formulario>
        </Card>
      </div>
    </>
  );
}
