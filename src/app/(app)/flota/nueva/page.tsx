import { requireModulo } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposEmbarcacion } from "@/components/form-embarcacion";
import { crearEmbarcacion } from "../actions";

export const metadata = { title: "Nueva embarcación · FleetNautic" };

export default async function NuevaEmbarcacionPage() {
  await requireModulo("flota", "flota:escribir");
  return (
    <>
      <PageHeader titulo="Nueva embarcación" />
      <Card className="max-w-2xl">
        <Formulario accion={crearEmbarcacion} enviar="Crear embarcación"><CamposEmbarcacion /></Formulario>
      </Card>
    </>
  );
}
