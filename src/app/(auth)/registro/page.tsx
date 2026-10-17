import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Campo, Input } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { getSesion } from "@/lib/auth/session";
import { BotonGoogle } from "@/components/boton-google";
import { registrar } from "../actions";

export const metadata = { title: "Crear cuenta · ERP Náutico" };

export default async function RegistroPage() {
  if (await getSesion()) redirect("/dashboard");
  return (
    <Card>
      <h1 className="mb-1 text-xl font-semibold">Crea tu empresa</h1>
      <p className="mb-4 text-sm text-muted">Prueba con todos los módulos. Sin tarjeta.</p>
      <Formulario accion={registrar} enviar="Crear cuenta">
        <Campo etiqueta="Nombre de la empresa"><Input name="empresa" required /></Campo>
        <Campo etiqueta="Tu nombre"><Input name="nombre" autoComplete="name" required /></Campo>
        <Campo etiqueta="Correo"><Input name="email" type="email" autoComplete="email" required /></Campo>
        <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres"><Input name="password" type="password" autoComplete="new-password" minLength={8} required /></Campo>
      </Formulario>
      <BotonGoogle texto="Registrarme con Google" />
      <p className="mt-4 text-center text-sm text-muted">
        ¿Ya tienes cuenta? <Link href="/login" className="font-medium text-brand">Inicia sesión</Link>
      </p>
    </Card>
  );
}
