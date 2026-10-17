/** Lógica pura de disponibilidad (sin BD) para poder probarla. Los horarios son
 *  minutos desde medianoche y las fechas son "YYYY-MM-DD" locales del negocio. */

export type Rango = { inicioMin: number; finMin: number };

/** Dos rangos [inicio, fin) se traslapan si cada uno empieza antes de que termine el otro. */
export function seTraslapan(a: Rango, b: Rango): boolean {
  return a.inicioMin < b.finMin && b.inicioMin < a.finMin;
}

export function rangoValido(r: Rango): boolean {
  return Number.isInteger(r.inicioMin) && Number.isInteger(r.finMin) &&
    r.inicioMin >= 0 && r.finMin <= 24 * 60 && r.inicioMin < r.finMin;
}

export function hayConflicto(nuevo: Rango, existentes: Rango[]): boolean {
  return existentes.some((e) => seTraslapan(nuevo, e));
}

/** Una fecha cae dentro de un bloqueo [desde, hasta] inclusivo (ISO comparables). */
export function enBloqueo(fecha: string, b: { desde: string; hasta: string }): boolean {
  return fecha >= b.desde && fecha <= b.hasta;
}

export function minutosAHora(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function horaAMinutos(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h <= 24 && mi < 60 ? h * 60 + mi : null;
}
