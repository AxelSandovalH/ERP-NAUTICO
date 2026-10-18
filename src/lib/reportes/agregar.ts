// Agregados para las gráficas (puro): series por mes, top N con "Otras", variaciones.
import { mesDe } from "@/lib/fechas";

export type Fila = { fecha: string; montoCentavos: number };

/** Suma por mes (YYYY-MM) para la lista de meses dada; los meses sin movimientos valen 0. */
export function sumarPorMes(filas: Fila[], meses: string[]): number[] {
  const por = new Map<string, number>(meses.map((m) => [m, 0]));
  for (const f of filas) {
    const m = mesDe(f.fecha);
    if (por.has(m)) por.set(m, por.get(m)! + f.montoCentavos);
  }
  return meses.map((m) => por.get(m)!);
}

export type Parte = { clave: string; etiqueta: string; centavos: number };

/** Las `n` partes más grandes; el resto se agrupa en «Otras». Las partes en cero o negativas se omiten. */
export function topConOtras(partes: Parte[], n: number): Parte[] {
  const orden = partes.filter((p) => p.centavos > 0).sort((a, b) => b.centavos - a.centavos || a.etiqueta.localeCompare(b.etiqueta));
  if (orden.length <= n) return orden;
  const resto = orden.slice(n).reduce((s, p) => s + p.centavos, 0);
  return [...orden.slice(0, n), { clave: "otras", etiqueta: "Otras", centavos: resto }];
}

/** Agrupa filas por clave sumando montos. */
export function agruparPor<T extends { montoCentavos: number }>(filas: T[], clave: (f: T) => string, etiqueta: (k: string) => string): Parte[] {
  const por = new Map<string, number>();
  for (const f of filas) por.set(clave(f), (por.get(clave(f)) ?? 0) + f.montoCentavos);
  return [...por].map(([k, centavos]) => ({ clave: k, etiqueta: etiqueta(k), centavos }));
}

/** Variación porcentual contra el periodo anterior; null si no hay base para comparar. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

/** Escala del eje Y: un paso «redondo» (1, 2 o 5 × 10ⁿ) y el techo como múltiplo de ese paso, con 5 marcas como máximo. */
export function escalaDeEje(max: number): { techo: number; paso: number } {
  if (max <= 0) return { techo: 400, paso: 100 };
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  for (const paso of [0.2, 0.5, 1, 2, 5, 10].map((f) => f * exp)) {
    if (Math.ceil(max / paso) <= 5) return { techo: Math.ceil(max / paso) * paso, paso };
  }
  return { techo: 10 * exp, paso: 5 * exp };
}

/** Cifra compacta para ejes y etiquetas: $12.3 mil, $1.2 M. Entra en centavos. */
export function compacto(centavos: number): string {
  const v = centavos / 100, a = Math.abs(v), signo = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${signo}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")} M`;
  if (a >= 1_000) return `${signo}$${(a / 1_000).toFixed(a >= 10_000 ? 0 : 1).replace(/\.0$/, "")} mil`;
  return `${signo}$${Math.round(a)}`;
}
