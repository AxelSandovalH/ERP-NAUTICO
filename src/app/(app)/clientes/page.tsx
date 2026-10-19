import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { BotonLink, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";

export const metadata = { title: "Clientes · FleetNautic" };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const s = await requireModulo("reservas");
  const term = q?.trim();
  const clientes = await withTenant(s.tenantId, (tx) =>
    tx.cliente.findMany({
      where: term ? { OR: [{ nombre: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, { telefono: { contains: term } }] } : {},
      orderBy: { nombre: "asc" }, take: 200, include: { _count: { select: { reservas: true } } },
    }));
  return (
    <>
      <PageHeader titulo="Clientes" sub={`${clientes.length} resultados`}
        acciones={puede(s.rol, "reservas:escribir") && <BotonLink href="/clientes/nuevo">Nuevo cliente</BotonLink>} />
      <form className="mb-4"><input name="q" defaultValue={term} placeholder="Buscar por nombre, correo o teléfono" className="w-full max-w-md rounded-lg border border-line bg-surface px-3 py-2 text-sm" /></form>
      {clientes.length === 0 ? <Vacio>Sin clientes.</Vacio> : (
        <Tabla>
          <thead><tr><Th>Nombre</Th><Th>Teléfono</Th><Th>Correo</Th><Th>Reservas</Th></tr></thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <Td><Link href={`/clientes/${c.id}`} className="font-medium text-brand">{c.nombre}</Link></Td>
                <Td>{c.telefono ?? "—"}</Td><Td>{c.email ?? "—"}</Td><Td>{c._count.reservas}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
