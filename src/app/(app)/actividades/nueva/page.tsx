import { requireModulo } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposActividad } from "@/components/actividades/form-actividad";
import { guardarActividadAccion } from "../actions";

export const metadata = { title: "Nueva actividad · FleetNautic" };

export default async function NuevaActividadPage() {
  await requireModulo("actividades", "actividades:escribir");
  return (
    <>
      <PageHeader titulo="Nueva actividad" sub="Una experiencia que vendes por persona" />
      <Card>
        <Formulario accion={guardarActividadAccion.bind(null, null)} enviar="Crear actividad"><CamposActividad /></Formulario>
        <p className="mt-3 text-xs text-muted">La foto se sube después de crearla.</p>
      </Card>
    </>
  );
}
