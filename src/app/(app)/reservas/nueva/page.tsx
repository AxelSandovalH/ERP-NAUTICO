import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { esIso, hoyIso } from "@/lib/fechas";
import { Card, PageHeader, Vacio } from "@/components/ui";
import { FormReserva } from "@/components/form-reserva";

export const metadata = { title: "Nueva reserva · ERP Náutico" };

export default async function NuevaReservaPage({ searchParams }: { searchParams: Promise<{ fecha?: string; embarcacionId?: string; inicio?: string; clienteId?: string }> }) {
  const sp = await searchParams;
  const s = await requireModulo("reservas", "reservas:escribir");
  const { embarcaciones, clientes } = await withTenant(s.tenantId, async (tx) => ({
    embarcaciones: await tx.embarcacion.findMany({
      where: { estado: "ACTIVA" }, orderBy: { nombre: "asc" },
      include: { tarifas: { where: { activa: true }, orderBy: { duracionMin: "asc" } } },
    }),
    clientes: await tx.cliente.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true }, take: 1000 }),
  }));
  return (
    <>
      <PageHeader titulo="Nueva reserva" />
      {embarcaciones.length === 0 ? <Vacio>Necesitas al menos una embarcación activa en Flota.</Vacio> : (
        <Card className="max-w-3xl">
          <FormReserva
            embarcaciones={embarcaciones.map((e) => ({
              id: e.id, nombre: e.nombre, capacidad: e.capacidad,
              tarifas: e.tarifas.map((t) => ({ id: t.id, nombre: t.nombre, duracionMin: t.duracionMin, precioCentavos: t.precioCentavos })),
            }))}
            clientes={clientes}
            inicial={{
              fecha: esIso(sp.fecha) ? sp.fecha : hoyIso(s.zonaHoraria),
              embarcacionId: embarcaciones.some((e) => e.id === sp.embarcacionId) ? sp.embarcacionId : undefined,
              inicio: sp.inicio && /^\d{2}:\d{2}$/.test(sp.inicio) ? sp.inicio : undefined,
              clienteId: clientes.some((c) => c.id === sp.clienteId) ? sp.clienteId : undefined,
            }}
          />
        </Card>
      )}
    </>
  );
}
