import { aDate, aIso, diasDelMes, nombreMes, sumarDias } from "@/lib/fechas";

export type Periodicidad = "SEMANAL" | "QUINCENAL" | "MENSUAL";
export type Periodo = { inicio: string; fin: string; etiqueta: string; dias: number };

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function diasEntre(inicio: string, fin: string): string[] {
  const out: string[] = [];
  for (let d = inicio; d <= fin; d = sumarDias(d, 1)) out.push(d);
  return out;
}

/** Periodo de pago que contiene a `fechaIso`: semana lunes–domingo, quincena 1–15 / 16–fin, o mes. */
export function periodoDe(p: Periodicidad, fechaIso: string): Periodo {
  const mes = fechaIso.slice(0, 7);
  let inicio: string, fin: string, etiqueta: string;
  if (p === "MENSUAL") {
    inicio = `${mes}-01`; fin = `${mes}-${String(diasDelMes(mes)).padStart(2, "0")}`;
    const n = nombreMes(mes); etiqueta = n.charAt(0).toUpperCase() + n.slice(1);
  } else if (p === "QUINCENAL") {
    const dia = Number(fechaIso.slice(8, 10));
    if (dia <= 15) { inicio = `${mes}-01`; fin = `${mes}-15`; } else { inicio = `${mes}-16`; fin = `${mes}-${String(diasDelMes(mes)).padStart(2, "0")}`; }
    etiqueta = `${Number(inicio.slice(8))}–${Number(fin.slice(8))} de ${nombreMes(mes)}`;
  } else {
    const dow = (aDate(fechaIso).getUTCDay() + 6) % 7; // 0 = lunes
    inicio = sumarDias(fechaIso, -dow); fin = sumarDias(inicio, 6);
    const f = (iso: string) => `${Number(iso.slice(8))} ${MESES_CORTO[Number(iso.slice(5, 7)) - 1]}`;
    etiqueta = `Semana ${f(inicio)} – ${f(fin)} ${fin.slice(0, 4)}`;
  }
  return { inicio, fin, etiqueta, dias: diasEntre(inicio, fin).length };
}

export const periodoSiguiente = (p: Periodicidad, per: Periodo) => periodoDe(p, sumarDias(per.fin, 1));
export const periodoAnterior = (p: Periodicidad, per: Periodo) => periodoDe(p, sumarDias(per.inicio, -1));

/** ¿Una fecha cae dentro del periodo? */
export const enPeriodo = (fecha: Date, per: Periodo) => { const f = aIso(fecha); return f >= per.inicio && f <= per.fin; };
