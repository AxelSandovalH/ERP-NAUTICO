"use client";
import { useTransition } from "react";
import { Boton } from "../ui";

/** Anula un movimiento pidiendo el motivo. Si no se puede (p. ej. ya se usó lo comprado), avisa por qué. */
export function BotonAnular({ accion }: { accion: (motivo: string) => Promise<unknown> }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Boton
      type="button" variante="peligro" disabled={pendiente}
      onClick={() => {
        const motivo = window.prompt("Motivo de la anulación:");
        if (!motivo) return;
        iniciar(async () => {
          const r = await accion(motivo);
          if (r && typeof r === "object" && "error" in r && r.error) window.alert(String(r.error));
        });
      }}
    >
      {pendiente ? "…" : "Anular"}
    </Boton>
  );
}
