import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { dinero } from "@/lib/fechas";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { ESTADOS_RESERVA, TONO_RESERVA } from "@/lib/etiquetas";
import { BotonLink, Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposCliente } from "@/components/form-cliente";
import { guardarCliente } from "../../reservas/actions";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("reservas");
  const c = await withTenant(s.tenantId, (tx) =>
    tx.cliente.findUnique({ where: { id }, include: { reservas: { orderBy: { fecha: "desc" }, include: { embarcacion: true } } } }));
  if (!c) notFound();
  const escribir = puede(s.rol, "reservas:escribir");
  return (
    <>
      <PageHeader titulo={c.nombre}
        acciones={escribir && <BotonLink href={`/reservas/nueva?clienteId=${c.id}`}>Nueva reserva</BotonLink>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Datos</h2>
          {escribir ? <Formulario accion={guardarCliente.bind(null, c.id)}><CamposCliente v={c} conFiscal={s.modulos.includes("facturacion") && puede(s.rol, "facturacion:ver")} /></Formulario>
            : <p className="text-sm">{c.telefono} · {c.email}</p>}
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Reservas</h2>
          {c.reservas.length === 0 ? <Vacio>Sin reservas.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Folio</Th><Th>Fecha</Th><Th>Embarcación</Th><Th>Estado</Th><Th>Total</Th></tr></thead>
              <tbody>
                {c.reservas.map((r) => (
                  <tr key={r.id}>
                    <Td><Link href={`/reservas/${r.id}`} className="text-brand">#{r.folio}</Link></Td>
                    <Td>{r.fecha.toISOString().slice(0, 10)} {minutosAHora(r.inicioMin)}</Td>
                    <Td>{r.embarcacion.nombre}</Td>
                    <Td><Insignia tono={TONO_RESERVA[r.estado]}>{ESTADOS_RESERVA[r.estado]}</Insignia></Td>
                    <Td>{dinero(r.totalCentavos, s.moneda)}</Td>
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
