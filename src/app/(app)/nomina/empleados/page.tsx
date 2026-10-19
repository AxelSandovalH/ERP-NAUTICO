import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { dinero } from "@/lib/fechas";
import { ESQUEMAS_PAGO, PERIODICIDADES } from "@/lib/etiquetas";
import { BotonLink, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";

export const metadata = { title: "Empleados · FleetNautic" };

export default async function EmpleadosPage() {
  const s = await requireModulo("nomina", "nomina:administrar");
  const empleados = await withTenant(s.tenantId, (tx) =>
    tx.empleado.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }], include: { usuario: { select: { email: true } }, tripulante: { select: { nombre: true } } } }));
  return (
    <>
      <Link href="/nomina" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Nómina</Link>
      <PageHeader titulo="Empleados" sub={`${empleados.filter((e) => e.activo).length} activos`} acciones={<BotonLink href="/nomina/empleados/nuevo">Nuevo empleado</BotonLink>} />
      {empleados.length === 0 ? <Vacio>Aún no hay empleados de nómina.</Vacio> : (
        <Tabla>
          <thead><tr><Th>Nombre</Th><Th>Esquema</Th><Th>Sueldo</Th><Th>Periodicidad</Th><Th>Checa con</Th><Th>Estado</Th></tr></thead>
          <tbody>
            {empleados.map((e) => (
              <tr key={e.id} className="hover:bg-brand-soft/50">
                <Td><Link href={`/nomina/empleados/${e.id}`} className="font-medium text-brand">{e.nombre} {e.apellido}</Link>{e.puesto && <span className="block text-xs text-muted">{e.puesto}</span>}</Td>
                <Td className="text-xs">{ESQUEMAS_PAGO[e.esquema]}</Td>
                <Td>{dinero(e.sueldoCentavos, s.moneda)}{e.esquema === "POR_DIA" && <span className="text-xs text-muted"> /día</span>}</Td>
                <Td>{PERIODICIDADES[e.periodicidad]}</Td>
                <Td className="text-xs">{e.usuario?.email ?? <span className="text-amber-700 dark:text-amber-300">Sin usuario</span>}{e.tripulante && <span className="block text-muted">Tripulante: {e.tripulante.nombre}</span>}</Td>
                <Td><Insignia tono={e.activo ? "verde" : "gris"}>{e.activo ? "Activo" : "Inactivo"}</Insignia></Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
