// Color de cada categoría de gastos e ingresos: el que la empresa le puso, o uno estable según su nombre.

const BASE: Record<string, string> = {
  "Combustible": "#f59e0b",
  "Mantenimiento y reparaciones": "#ea580c",
  "Nómina": "#0e7c86",
  "Comisiones": "#6366f1",
  "Insumos": "#16a34a",
  "Muelle y marina": "#0284c7",
  "Seguros": "#7c3aed",
  "Renta": "#0d9488",
  "Publicidad": "#db2777",
  "Impuestos": "#dc2626",
  "Administrativos": "#64748b",
  "Otros": "#94a3b8",
  "Reservas": "#0e7c86",
  "Extras y propinas": "#16a34a",
  "Otros ingresos": "#94a3b8",
};
export const PALETA = ["#0e7c86", "#f59e0b", "#6366f1", "#16a34a", "#db2777", "#0284c7", "#ea580c", "#7c3aed", "#0d9488", "#dc2626", "#ca8a04", "#4f46e5"];
export const GRIS = "#94a3b8";

export const esColorHex = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);

/** Color elegido por la empresa; si no hay, el de las categorías base; si tampoco, uno de la paleta según el nombre. */
export function colorDeCategoria(nombre: string | null | undefined, elegido?: string | null): string {
  if (esColorHex(elegido)) return elegido;
  if (!nombre) return GRIS;
  if (BASE[nombre]) return BASE[nombre];
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}
