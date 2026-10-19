import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { Card, PageHeader } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposTripulante } from "@/components/form-tripulante";
import { guardarTripulante } from "../actions";

export const metadata = { title: "Nuevo tripulante · FleetNautic" };

export default async function NuevoTripulantePage() {
  const s = await requireModulo("tripulacion", "tripulacion:escribir");
  const flota = await withTenant(s.tenantId, (tx) => tx.embarcacion.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true, color: true } }));
  return (
    <>
      <PageHeader titulo="Nuevo tripulante" />
      <Card className="max-w-2xl">
        <Formulario accion={guardarTripulante.bind(null, null)} enviar="Crear tripulante"><CamposTripulante flota={flota} /></Formulario>
      </Card>
    </>
  );
}
