"use client";
import { useTransition } from "react";
import { Boton } from "./ui";

/** Botón para acciones de un clic (eliminar, cambiar estado) con confirmación opcional. */
export function BotonAccion({
  accion, etiqueta, confirmar, variante = "suave",
}: { accion: () => Promise<unknown>; etiqueta: string; confirmar?: string; variante?: "primario" | "suave" | "peligro" }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Boton
      type="button"
      variante={variante}
      disabled={pendiente}
      onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return;
        iniciar(async () => {
          const r = await accion();
          // Las acciones que pueden fallar devuelven { error } para que la persona sepa por qué no pasó nada
          if (r && typeof r === "object" && "error" in r && r.error) window.alert(String(r.error));
        });
      }}
    >
      {pendiente ? "…" : etiqueta}
    </Boton>
  );
}
