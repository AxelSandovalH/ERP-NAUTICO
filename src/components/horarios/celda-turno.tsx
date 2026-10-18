"use client";
import { useState, useTransition } from "react";

export type OpcionTurno = { valor: string; etiqueta: string };

/** Una celda de la cuadrícula: un selector que guarda al cambiar. El valor se muestra al instante y vuelve atrás si falla. */
export function CeldaTurno({ accion, valor, opciones, color, nombre }: {
  accion: (valor: string) => Promise<unknown>; valor: string; opciones: OpcionTurno[]; color: string | null; nombre: string;
}) {
  const [actual, setActual] = useState(valor);
  const [pendiente, iniciar] = useTransition();
  // Si cambió desde el servidor (otra semana, otra persona editando), manda el servidor
  const [visto, setVisto] = useState(valor);
  if (visto !== valor) { setVisto(valor); setActual(valor); }
  return (
    <select
      aria-label={nombre}
      value={actual}
      disabled={pendiente}
      onChange={(e) => {
        const nuevo = e.target.value, previo = actual;
        setActual(nuevo);
        iniciar(async () => {
          const r = await accion(nuevo);
          if (r && typeof r === "object" && "error" in r && r.error) { setActual(previo); window.alert(String(r.error)); }
        });
      }}
      className="w-full min-w-28 rounded-md border border-line bg-surface px-1.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
      style={color ? { borderLeft: `4px solid ${color}` } : undefined}
    >
      {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
    </select>
  );
}
