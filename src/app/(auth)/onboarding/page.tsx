import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { createClient } from "@/lib/supabase/server";
import { Card, Campo, Input } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { crearEmpresaOnboarding, salir } from "../actions";

export const metadata = { title: "Crea tu empresa · FleetNautic" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  // Si ya tiene empresa, no hay nada que completar
  if (await prisma.usuario.findUnique({ where: { supabaseId: data.user.id } })) redirect("/dashboard");
  return (
    <Card>
      <h1 className="mb-1 text-xl font-semibold">Un último paso</h1>
      <p className="mb-4 text-sm text-muted">Entraste como <b>{data.user.email}</b>. Aún no tienes una empresa en FleetNautic: créala para empezar la prueba con todos los módulos.</p>
      <Formulario accion={crearEmpresaOnboarding} enviar="Crear mi empresa">
        <Campo etiqueta="Nombre de la empresa"><Input name="empresa" required autoFocus /></Campo>
      </Formulario>
      <form action={salir} className="mt-4 text-center">
        <button className="text-sm text-muted hover:text-foreground">Usar otra cuenta</button>
      </form>
    </Card>
  );
}
