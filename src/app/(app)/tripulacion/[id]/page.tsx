import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { aDate, aIso, hoyIso } from "@/lib/fechas";
import { hhmm } from "@/lib/calendario/mapear";
import { ROLES_TRIPULANTE } from "@/lib/etiquetas";
import { Card, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposTripulante } from "@/components/form-tripulante";
import { guardarTripulante } from "../actions";

export default async function TripulantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("tripulacion");
  const { t, flota } = await withTenant(s.tenantId, async (tx) => ({
    t: await tx.tripulante.findUnique({
      where: { id },
      include: {
        embarcaciones: true,
        asignaciones: {
          where: { reserva: { fecha: { gte: aDate(hoyIso(s.zonaHoraria)) }, estado: { not: "CANCELADA" } } },
          include: { reserva: { include: { embarcacion: true, cliente: true } } },
        },
      },
    }),
    flota: await tx.embarcacion.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true, color: true } }),
  }));
  if (!t) notFound();
  const editar = puede(s.rol, "tripulacion:escribir");
  const proximas = [...t.asignaciones].sort((a, b) => a.reserva.fecha.getTime() - b.reserva.fecha.getTime() || a.reserva.inicioMin - b.reserva.inicioMin);
  return (
    <>
      <PageHeader titulo={`${t.nombre} ${t.apellido}`} sub={ROLES_TRIPULANTE[t.rol]} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Datos</h2>
          {editar ? (
            <Formulario accion={guardarTripulante.bind(null, t.id)}>
              <CamposTripulante v={t} flota={flota} fijas={t.embarcaciones.map((e) => e.embarcacionId)} conActivo />
            </Formulario>
          ) : <p className="text-sm text-muted">Solo lectura para tu rol.</p>}
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Próximas asignaciones</h2>
          {proximas.length === 0 ? <Vacio>Sin asignaciones próximas.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Fecha</Th><Th>Horario</Th><Th>Embarcación</Th><Th>Rol</Th><Th>Llegada</Th></tr></thead>
              <tbody>
                {proximas.map((a) => (
                  <tr key={a.reservaId}>
                    <Td><Link href={`/reservas/${a.reservaId}`} className="text-brand">{aIso(a.reserva.fecha)} #{a.reserva.folio}</Link></Td>
                    <Td>{hhmm(a.reserva.inicioMin)}–{hhmm(a.reserva.finMin)}</Td>
                    <Td>{a.reserva.embarcacion.nombre}</Td>
                    <Td>{ROLES_TRIPULANTE[a.rol]}</Td>
                    <Td>{a.horaLlegada ?? "—"}</Td>
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
