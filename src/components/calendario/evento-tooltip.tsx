"use client";

import { Phone, Users, Wrench } from "lucide-react";
import type { PropBloqueo, PropReserva } from "@/lib/calendario/tipos";
import { dinero } from "@/lib/fechas";

export type TooltipEstado = { props: PropReserva | PropBloqueo; x: number; y: number; rect: DOMRect };

const ESTADO = { PENDIENTE: "Pendiente", CONFIRMADA: "Confirmada", COMPLETADA: "Completada", CANCELADA: "Cancelada" } as const;
const COBRO = { LIQUIDADA: "Liquidada", PARCIAL: "Anticipo recibido", SIN_PAGO: "Sin pago" } as const;
const ANCHO = 280;

/** Posiciona junto al evento sin salirse de la pantalla. */
function posicion(x: number, rect: DOMRect, alto: number) {
  const margen = 12;
  let left = x + margen;
  if (left + ANCHO > window.innerWidth - margen) left = Math.max(margen, x - ANCHO - margen);
  let top = rect.bottom + 6;
  if (top + alto > window.innerHeight - margen) top = Math.max(margen, rect.top - alto - 6);
  return { top, left };
}

export function EventoTooltip({ t, moneda }: { t: TooltipEstado; moneda: string }) {
  const p = t.props;
  const { top, left } = posicion(t.x, t.rect, p.tipo === "reserva" ? 210 : 110);
  return (
    <div className="pointer-events-none fixed z-50 rounded-xl border border-line bg-surface p-3 text-sm shadow-xl" style={{ top, left, width: ANCHO }}>
      {p.tipo === "bloqueo" ? (
        <>
          <p className="flex items-center gap-1.5 font-semibold"><Wrench className="h-3.5 w-3.5" /> Bloqueo · {p.embarcacion}</p>
          <p className="mt-1 text-muted">{p.motivo}</p>
          <p className="text-xs text-muted">{p.desde} → {p.hasta}</p>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold leading-tight">{p.cliente}</p>
            <span className="shrink-0 text-xs text-muted">#{p.folio}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted">{p.embarcacion} · {p.horaInicio}–{p.horaFin}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{p.personas} pax</span>
            {p.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{p.telefono}</span>}
            <span>{ESTADO[p.estado]}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-xs">
            <span className="text-muted">{COBRO[p.cobro]}</span>
            <span className="font-semibold">{dinero(p.pagadoCentavos, moneda)} / {dinero(p.totalCentavos, moneda)}</span>
          </div>
          {p.capitan && <p className="mt-1 text-[11px] text-muted">Capitán: {p.capitan}</p>}
          {p.vendedor && <p className="text-[11px] text-muted">Creada por {p.vendedor}</p>}
        </>
      )}
    </div>
  );
}
