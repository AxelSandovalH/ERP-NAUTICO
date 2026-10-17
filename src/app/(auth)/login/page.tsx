import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Campo, Input } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { getSesion } from "@/lib/auth/session";
import { login } from "../actions";

export const metadata = { title: "Iniciar sesión · ERP Náutico" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (await getSesion()) redirect("/dashboard");
  return (
    <Card>
      <h1 className="mb-4 text-xl font-semibold">Iniciar sesión</h1>
      {error === "confirmacion" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          El enlace de confirmación no es válido o expiró. Inicia sesión o pide uno nuevo.
        </p>
      )}
      <Formulario accion={login} enviar="Entrar">
        <Campo etiqueta="Correo"><Input name="email" type="email" autoComplete="email" required autoFocus /></Campo>
        <Campo etiqueta="Contraseña"><Input name="password" type="password" autoComplete="current-password" required /></Campo>
      </Formulario>
      <p className="mt-4 text-center text-sm text-muted">
        ¿Sin cuenta? <Link href="/registro" className="font-medium text-brand">Crea tu empresa</Link>
      </p>
    </Card>
  );
}
