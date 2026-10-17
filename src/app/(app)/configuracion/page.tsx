import { prisma } from "@/lib/db/client";
import { requireSesion } from "@/lib/auth/session";
import { puede } from "@/modules/permisos";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { MODULOS, MODULOS_POR_PLAN, PLANES, PLANES_DE_PAGO, esConstruido, type ModuloId } from "@/modules/registry";
import { dinero } from "@/lib/fechas";
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
      <PageHeader titulo="Configuración" sub={`Plan ${PLANES[tenant.plan].nombre}`} />

      <section className="mb-8">
        <h2 className="mb-1 font-semibold">Planes</h2>
        <p className="mb-4 text-sm text-muted">
          {tenant.plan === "PRUEBA" ? "Estás en el periodo de prueba con todos los módulos disponibles." : `Tu plan actual es ${PLANES[tenant.plan].nombre}.`} Para cambiar de plan, contacta a FleetNautic.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANES_DE_PAGO.map((id) => {
            const plan = PLANES[id];
            const actual = tenant.plan === id;
            return (
              <Card key={id} className={actual ? "border-brand ring-1 ring-brand" : ""}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-semibold">{plan.nombre}</h3>
                  {actual && <Insignia tono="azul">Tu plan</Insignia>}
                </div>
                <p className="mt-1"><span className="text-2xl font-semibold">{dinero((plan.precioMxnMensual ?? 0) * 100, "MXN")}</span> <span className="text-sm text-muted">MXN / mes</span></p>
                <p className="mt-1 text-sm text-muted">{plan.resumen}</p>
                {plan.incluye && <p className="mt-3 text-xs font-medium">Incluye todo lo de {PLANES[plan.incluye].nombre}, más:</p>}
                <ul className="mt-2 space-y-1.5 text-sm">
                  {plan.caracteristicas.map((c) => {
                    const listo = c.modulos.some(esConstruido);
                    return (
                      <li key={c.etiqueta} className="flex items-center gap-2">
                        {listo ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Clock className="h-4 w-4 shrink-0 text-muted" />}
                        <span className={listo ? "" : "text-muted"}>{c.etiqueta}{!listo && " · próximamente"}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-semibold">Módulos</h2>
          <p className="mb-4 text-sm text-muted">Activa o desactiva los módulos incluidos en tu plan. Los que dependen de otros se apagan solos.</p>
          <Formulario accion={guardarModulos}>
            <ul className="space-y-3">
              {(Object.values(MODULOS)).filter((m) => m.id !== "nucleo" && !m.implicito && !m.proximamente).map((m) => {
                const enPlan = incluidos.includes(m.id as ModuloId);
                return (
                  <li key={m.id}>
                    <label className={`flex items-start gap-3 text-sm ${enPlan ? "" : "opacity-50"}`}>
                      <input type="checkbox" name="modulo" value={m.id} defaultChecked={s.modulos.includes(m.id)} disabled={!enPlan} className="mt-1" />
                      <span>
                        <span className="font-medium">{m.nombre}</span>{!enPlan && <Insignia>No incluido en tu plan</Insignia>}
                        <span className="block text-muted">{m.descripcion}</span>
                        {m.requiere.filter((r) => !MODULOS[r].implicito).length > 0 && <span className="block text-xs text-muted">Requiere: {m.requiere.filter((r) => !MODULOS[r].implicito).map((r) => MODULOS[r].nombre).join(", ")}</span>}
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
