import { prisma } from "@/lib/db/client";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { Card, PageHeader } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposEmpleado } from "@/components/form-empleado";
import { guardarEmpleado } from "../../actions";

export const metadata = { title: "Nuevo empleado · FleetNautic" };

export default async function NuevoEmpleadoPage() {
  const s = await requireModulo("nomina", "nomina:administrar");
  const [usuarios, ocupados] = [
    await prisma.usuario.findMany({ where: { tenantId: s.tenantId, activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, email: true } }),
    await withTenant(s.tenantId, (tx) => tx.empleado.findMany({ select: { usuarioId: true, tripulanteId: true } })),
  ];
  const tripulantes = await withTenant(s.tenantId, (tx) => tx.tripulante.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, apellido: true } }));
  const uOcup = new Set(ocupados.map((o) => o.usuarioId)), tOcup = new Set(ocupados.map((o) => o.tripulanteId));
  return (
    <>
      <PageHeader titulo="Nuevo empleado" />
      <Card className="max-w-2xl">
        <Formulario accion={guardarEmpleado.bind(null, null)} enviar="Crear empleado">
          <CamposEmpleado moneda={s.moneda} usuarios={usuarios.filter((u) => !uOcup.has(u.id))} tripulantes={tripulantes.filter((t) => !tOcup.has(t.id)).map((t) => ({ id: t.id, nombre: `${t.nombre} ${t.apellido}`.trim() }))} />
        </Formulario>
      </Card>
    </>
  );
}
