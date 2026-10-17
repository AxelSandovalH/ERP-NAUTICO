// Ventanas reales de disponibilidad de una embarcación en un día. Reservas +
// bloqueos = tiempo ocupado; sobre lo que queda se verifica si cabe un tour
// completo de la duración base dejando un margen de preparación entre tours.
// Puro y sin fechas: todo en minutos desde la medianoche local del negocio.

export type Ocupado = { ini: number; fin: number; tipo: "RESERVA" | "BLOQUEO"; label: string };
export type Grupo = "MANANA" | "MEDIODIA" | "SUNSET";
export type Ventana = { ini: number; fin: number; grupos: Grupo[] };

export type Parametros = {
  duracionMin: number; // duración base del tour
  margenMin: number; // preparación entre tours
  diaIni: number; // primera salida posible del día
  diaFin: number; // hora límite de regreso
};

/** Agrupación por hora de SALIDA: Mañana <12:00, Mediodía 12:00–<16:00, Sunset ≥16:00 */
const CORTE_MEDIODIA = 12 * 60, CORTE_SUNSET = 16 * 60;

export const ETIQUETA_GRUPO: Record<Grupo, string> = { MANANA: "Mañana", MEDIODIA: "Mediodía", SUNSET: "Sunset" };
export const EMOJI_GRUPO: Record<Grupo, string> = { MANANA: "🌅", MEDIODIA: "☀️", SUNSET: "🌇" };

export function hhmmAMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 9:00 a.m. / 12:30 p.m. */
export function minAHora(min: number): string {
  const h24 = Math.floor(min / 60) % 24, m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "a.m." : "p.m."}`;
}

function gruposDe(ini: number, fin: number, duracionMin: number): Grupo[] {
  const ultimaSalida = fin - duracionMin;
  const g: Grupo[] = [];
  if (ini < CORTE_MEDIODIA) g.push("MANANA");
  if (ini < CORTE_SUNSET && ultimaSalida >= CORTE_MEDIODIA) g.push("MEDIODIA");
  if (ultimaSalida >= CORTE_SUNSET) g.push("SUNSET");
  return g;
}

export function ventanasLibres(ocupados: Ocupado[], p: Parametros): Ventana[] {
  // Fusiona ocupaciones que se traslapan, recortadas al día operativo
  const bloques = ocupados
    .map((o) => ({ ini: Math.max(o.ini, p.diaIni), fin: Math.min(o.fin, p.diaFin) }))
    .filter((o) => o.fin > o.ini)
    .sort((a, b) => a.ini - b.ini)
    .reduce<{ ini: number; fin: number }[]>((acc, o) => {
      const u = acc[acc.length - 1];
      if (u && o.ini <= u.fin) u.fin = Math.max(u.fin, o.fin);
      else acc.push({ ...o });
      return acc;
    }, []);

  const ventanas: Ventana[] = [];
  let cursor = p.diaIni;
  const evaluar = (ini: number, fin: number) => {
    if (fin - ini >= p.duracionMin) ventanas.push({ ini, fin, grupos: gruposDe(ini, fin, p.duracionMin) });
  };
  for (const b of bloques) {
    evaluar(cursor, b.ini - p.margenMin); // debe terminar `margen` antes de que empiece lo siguiente
    cursor = b.fin + p.margenMin;
  }
  evaluar(cursor, p.diaFin);
  return ventanas;
}

/** "Mañana — 9:00 a.m. a 12:00 p.m." / "Todo el día — 9:00 a.m. a 8:00 p.m." */
export function describirVentana(v: Ventana): string {
  const nombre = v.grupos.length === 3 ? "Todo el día"
    : v.grupos.length === 0 ? "Disponible"
    : v.grupos.map((g) => ETIQUETA_GRUPO[g]).join(" y ");
  return `${nombre} — ${minAHora(v.ini)} a ${minAHora(v.fin)}`;
}

export function emojiVentana(v: Ventana): string {
  return v.grupos.length === 3 ? "🟢" : EMOJI_GRUPO[v.grupos[0] ?? "MEDIODIA"];
}
