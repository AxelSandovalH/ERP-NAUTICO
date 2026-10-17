"use client";
import { useActionState, type ReactNode } from "react";
import { Boton } from "./ui";

export type EstadoForm = { error?: string; ok?: string } | undefined;
type Accion = (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;

/** Formulario con server action: muestra el error devuelto y bloquea el botón mientras envía. */
export function Formulario({
  accion, children, enviar = "Guardar", className, variante,
}: { accion: Accion; children: ReactNode; enviar?: string; className?: string; variante?: "primario" | "suave" | "peligro" }) {
  const [estado, ejecutar, pendiente] = useActionState(accion, undefined);
  return (
    <form action={ejecutar} className={className ?? "space-y-4"}>
      {children}
      {estado?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {estado.error}
        </p>
      )}
      {estado?.ok && <p className="text-sm text-emerald-600">{estado.ok}</p>}
      <Boton type="submit" disabled={pendiente} variante={variante}>
        {pendiente ? "Guardando…" : enviar}
      </Boton>
    </form>
  );
}
