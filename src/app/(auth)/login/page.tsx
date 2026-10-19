import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Campo, Input } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { getSesion } from "@/lib/auth/session";
import { BotonGoogle } from "@/components/boton-google";
import { login } from "../actions";

export const metadata = { title: "Iniciar sesión · FleetNautic" };

const AVISOS: Record<string, string> = {
  confirmacion: "El enlace de confirmación no es válido o expiró. Inicia sesión o pide uno nuevo.",
  google: "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
  inactivo: "Tu cuenta no está activa. Contacta a tu administrador.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (await getSesion()) redirect("/dashboard");
  return (
    <Card>
      <h1 className="mb-4 text-xl font-semibold">Iniciar sesión</h1>
      {error && AVISOS[error] && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{AVISOS[error]}</p>
      )}
      <Formulario accion={login} enviar="Entrar">
        <Campo etiqueta="Correo"><Input name="email" type="email" autoComplete="email" required autoFocus /></Campo>
        <Campo etiqueta="Contraseña"><Input name="password" type="password" autoComplete="current-password" required /></Campo>
      </Formulario>
      <BotonGoogle />
      <p className="mt-4 text-center text-sm text-muted">
        ¿Sin cuenta? <Link href="/registro" className="font-medium text-brand">Crea tu empresa</Link>
      </p>
    </Card>
  );
}
