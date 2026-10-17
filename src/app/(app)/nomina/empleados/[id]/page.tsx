import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero } from "@/lib/fechas";
import { ESTADOS_PAGO_NOMINA } from "@/lib/etiquetas";
import { Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposEmpleado } from "@/components/form-empleado";
import { guardarEmpleado } from "../../actions";

export default async function EmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("nomina", "nomina:administrar");
  const { e, otros, tripulantes, pagos } = await withTenant(s.tenantId, async (tx) => ({
    e: await tx.empleado.findUnique({ where: { id } }),
    otros: await tx.empleado.findMany({ where: { id: { not: id } }, select: { usuarioId: true, tripulanteId: true } }),
    tripulantes: await tx.tripulante.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, apellido: true } }),
    pagos: await tx.pagoNomina.findMany({ where: { empleadoId: id }, orderBy: { periodoInicio: "desc" }, take: 12 }),
  }));
  if (!e) notFound();
  const usuarios = await prisma.usuario.findMany({ where: { tenantId: s.tenantId, activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, email: true } });
  const uOcup = new Set(otros.map((o) => o.usuarioId)), tOcup = new Set(otros.map((o) => o.tripulanteId));
  return (
    <>
      <Link href="/nomina/empleados" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Empleados</Link>
      <PageHeader titulo={`${e.nombre} ${e.apellido}`} sub={e.puesto ?? undefined} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Datos</h2>
          <Formulario accion={guardarEmpleado.bind(null, e.id)}>
            <CamposEmpleado v={e} moneda={s.moneda} conActivo
              usuarios={usuarios.filter((u) => !uOcup.has(u.id))}
              tripulantes={tripulantes.filter((t) => !tOcup.has(t.id)).map((t) => ({ id: t.id, nombre: `${t.nombre} ${t.apellido}`.trim() }))} />
          </Formulario>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Últimos pagos</h2>
          {pagos.length === 0 ? <Vacio>Sin pagos todavía.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Periodo</Th><Th>Neto</Th><Th>Estado</Th></tr></thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id}>
                    <Td><Link href={`/nomina/pagos/${p.id}`} className="text-brand">{aIso(p.periodoInicio)} → {aIso(p.periodoFin)}</Link></Td>
                    <Td>{dinero(p.netoCentavos, s.moneda)}</Td>
                    <Td><Insignia tono={p.estado === "PAGADO" ? "verde" : p.estado === "CANCELADO" ? "rojo" : "ambar"}>{ESTADOS_PAGO_NOMINA[p.estado]}</Insignia></Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>
      </div>
    </>
  );
}
