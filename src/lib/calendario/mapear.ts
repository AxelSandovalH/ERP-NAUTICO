import type { Cobro } from "./tipos";

/** Estado real de cobro comparando lo pagado contra el total. */
export function cobroDe(totalCentavos: number, pagadoCentavos: number): Cobro {
  if (totalCentavos <= 0) return "LIQUIDADA";
  if (pagadoCentavos >= totalCentavos) return "LIQUIDADA";
  return pagadoCentavos > 0 ? "PARCIAL" : "SIN_PAGO";
}

/** "Ana Demo" → "AD"; un solo nombre → sus dos primeras letras. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "-";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const ORIGEN_ABREV: Record<string, string> = { DIRECTO: "DI", WEB: "WEB", AGENCIA: "AG", CONCIERGE: "CO" };
export const abreviarOrigen = (o: string) => ORIGEN_ABREV[o] ?? o.slice(0, 3).toUpperCase();

/** minutos desde medianoche → "HH:MM" */
export function hhmm(min: number): string {
  return `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Fecha ISO local + minutos → "YYYY-MM-DDTHH:MM:00" (sin zona: es hora local del negocio). */
export function inicioFin(fechaIso: string, min: number): string {
  return `${fechaIso}T${hhmm(min)}:00`;
}
