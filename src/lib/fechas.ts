/** Fechas de negocio como "YYYY-MM-DD" (sin zona horaria). Las columnas @db.Date
 *  se leen/escriben a medianoche UTC para que el día nunca se corra. */

export function aDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function aIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function esIso(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = aDate(s);
  // Ida y vuelta: JavaScript desborda "2026-02-31" a marzo en lugar de rechazarlo
  return !Number.isNaN(d.getTime()) && aIso(d) === s;
}

export function sumarDias(iso: string, n: number): string {
  const d = aDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aIso(d);
}

/** Día de hoy en la zona horaria del negocio (no en UTC: en Los Cabos, después
 *  de las 17:00 ya es "mañana" en UTC). */
export function hoyIso(zona = "America/Mazatlan"): string {
  return diaLocal(new Date(), zona);
}

/** Día "YYYY-MM-DD" de un instante, visto en la zona horaria del negocio. */
export function diaLocal(instante: Date, zona = "America/Mazatlan"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(instante);
}

export function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

export function sumarMeses(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function diasDelMes(mes: string): number {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = lunes … 6 = domingo, del primer día del mes. */
export function offsetInicioMes(mes: string): number {
  const [y, m] = mes.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

const DIAS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
export function fechaLarga(iso: string): string {
  const d = aDate(iso);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function dinero(centavos: number, moneda = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda }).format(centavos / 100);
}

export function pesosACentavos(valor: string): number | null {
  const n = Number(valor.replace(/[, $]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Hora de un instante en la zona del negocio: "9:05 a. m." */
export function horaLocal(instante: Date, zona = "America/Mazatlan"): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: zona, hour: "numeric", minute: "2-digit", hour12: true }).format(instante);
}
