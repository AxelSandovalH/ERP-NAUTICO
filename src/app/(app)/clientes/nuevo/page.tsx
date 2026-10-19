import { requireModulo } from "@/lib/auth/session";
import { puede } from "@/modules/permisos";
import { Card, PageHeader } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposCliente } from "@/components/form-cliente";
import { guardarCliente } from "../../reservas/actions";

export default async function NuevoClientePage() {
  const s = await requireModulo("reservas", "reservas:escribir");
  return (
    <>
      <PageHeader titulo="Nuevo cliente" />
      <Card className="max-w-2xl"><Formulario accion={guardarCliente.bind(null, null)} enviar="Crear cliente"><CamposCliente conFiscal={s.modulos.includes("facturacion") && puede(s.rol, "facturacion:ver")} /></Formulario></Card>
    </>
  );
}
