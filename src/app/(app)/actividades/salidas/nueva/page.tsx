import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { esIso, hoyIso } from "@/lib/fechas";
import { Card, PageHeader } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposSalida } from "@/components/actividades/form-salida";
import { programarSalidaAccion } from "../../actions";

export const metadata = { title: "Programar salida · FleetNautic" };

export default async function NuevaSalidaPage({ searchParams }: { searchParams: Promise<{ actividad?: string; fecha?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("actividades", "actividades:escribir");
  const d = await withTenant(s.tenantId, async (tx) => ({
    actividades: await tx.actividad.findMany({ where: { activa: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    embarcaciones: await tx.embarcacion.findMany({ where: { estado: "ACTIVA" }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, capacidad: true } }),
    guias: await tx.tripulante.findMany({ where: { activo: true }, orderBy: [{ rol: "asc" }, { nombre: "asc" }] }),
  }));
  return (
    <>
      <PageHeader titulo="Programar salida" sub="Una fecha y hora para una actividad, con su cupo" />
      <Card>
        <Formulario accion={programarSalidaAccion} enviar="Programar salida">
          <CamposSalida actividades={d.actividades} embarcaciones={d.embarcaciones} guias={d.guias.map((g) => ({ id: g.id, nombre: `${g.nombre} ${g.apellido}`.trim() }))}
            v={{ actividadId: q.actividad, fecha: esIso(q.fecha) ? q.fecha : hoyIso(s.zonaHoraria) }} />
        </Formulario>
      </Card>
    </>
  );
}
