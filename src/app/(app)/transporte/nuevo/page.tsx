import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, aIso, hoyIso, sumarDias } from "@/lib/fechas";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { Card, PageHeader } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposTraslado } from "@/components/transporte/form-traslado";
import { guardarTrasladoAccion } from "../actions";

export const metadata = { title: "Nuevo traslado · FleetNautic" };

export default async function NuevoTrasladoPage({ searchParams }: { searchParams: Promise<{ reserva?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("transporte", "transporte:gestionar");
  const hoy = hoyIso(s.zonaHoraria);
  const d = await withTenant(s.tenantId, async (tx) => ({
    reservas: await tx.reserva.findMany({ where: { estado: { not: "CANCELADA" }, fecha: { gte: aDate(sumarDias(hoy, -1)) } }, orderBy: [{ fecha: "asc" }, { inicioMin: "asc" }], take: 150, include: { cliente: true, embarcacion: true } }),
    unidades: await tx.unidadTransporte.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } }),
    choferes: await tx.empleado.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
  }));
  const elegida = d.reservas.find((r) => r.id === q.reserva) ?? null;
  // Lo que se puede adivinar de la reserva: el día, los pasajeros y una hora de recogida 2 h antes de la salida
  const recogida = elegida ? Math.max(0, elegida.inicioMin - 120) : null;

  return (
    <>
      <PageHeader titulo="Nuevo traslado" sub="Recoger o regresar a los clientes de una reserva" />
      <Card>
        <Formulario accion={guardarTrasladoAccion.bind(null, null)} enviar="Crear traslado">
          <CamposTraslado
            reservaId={elegida?.id}
            reservas={d.reservas.map((r) => ({ id: r.id, etiqueta: `#${r.folio} · ${r.cliente.nombre} · ${aIso(r.fecha)} ${minutosAHora(r.inicioMin)} · ${r.embarcacion.nombre} · ${r.pax} pax` }))}
            unidades={d.unidades.map((u) => ({ id: u.id, nombre: u.nombre, capacidad: u.capacidad }))}
            choferes={d.choferes.map((c) => ({ id: c.id, nombre: `${c.nombre} ${c.apellido}`.trim() }))}
            v={{ fecha: elegida ? aIso(elegida.fecha) : hoy, hora: recogida !== null ? minutosAHora(recogida) : undefined, pax: elegida?.pax }}
          />
        </Formulario>
      </Card>
    </>
  );
}
