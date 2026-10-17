import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { TIPOS_BENEFICIARIO } from "@/lib/etiquetas";
import { Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposBeneficiario } from "@/components/form-beneficiario";
import { guardarBeneficiario } from "../actions";

export const metadata = { title: "Beneficiarios · ERP Náutico" };

export default async function BeneficiariosPage() {
  const s = await requireModulo("comisiones", "comisiones:administrar");
  const [bens, usuarios] = [
    await withTenant(s.tenantId, (tx) => tx.beneficiario.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }], include: { _count: { select: { tarifas: true } }, usuario: { select: { email: true } } } })),
    await prisma.usuario.findMany({ where: { tenantId: s.tenantId, activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, email: true } }),
  ];
  const vinculados = new Set(bens.map((b) => b.usuarioId).filter(Boolean));
  return (
    <>
      <PageHeader titulo="Beneficiarios" sub="Quién cobra comisiones: vendedores, agencias, concierge…" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {bens.length === 0 ? <Vacio>Aún no hay beneficiarios. Crea el primero a la derecha.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Nombre</Th><Th>Tipo</Th><Th>Usuario</Th><Th>Tarifas</Th><Th>Estado</Th></tr></thead>
              <tbody>
                {bens.map((b) => (
                  <tr key={b.id} className="hover:bg-brand-soft/50">
                    <Td><Link href={`/comisiones/beneficiarios/${b.id}`} className="font-medium text-brand">{b.nombre}</Link></Td>
                    <Td>{TIPOS_BENEFICIARIO[b.tipo]}</Td>
                    <Td>{b.usuario?.email ?? "—"}</Td>
                    <Td>{b._count.tarifas === 0 ? <Insignia tono="ambar">Sin tarifa</Insignia> : b._count.tarifas}</Td>
                    <Td><Insignia tono={b.activo ? "verde" : "gris"}>{b.activo ? "Activo" : "Inactivo"}</Insignia></Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Nuevo beneficiario</h2>
          <Formulario accion={guardarBeneficiario.bind(null, null)} enviar="Crear beneficiario">
            <CamposBeneficiario usuarios={usuarios.filter((u) => !vinculados.has(u.id))} />
          </Formulario>
        </Card>
      </div>
    </>
  );
}
