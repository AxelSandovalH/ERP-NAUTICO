// Emparejamiento sugerido entre líneas del banco y movimientos del sistema (puro, sin BD).
import { aDate } from "@/lib/fechas";
import { normalizar } from "./importar";

export type Candidato = {
  /** "g:<id>" gasto, "i:<id>" ingreso, "t:<id>" traspaso */
  clave: string;
  fecha: string;
  /** Con signo y en la moneda de la cuenta: − sale, + entra */
  montoCentavos: number;
  texto: string;
};
export type LineaPendiente = { id: string; fecha: string; montoCentavos: number; descripcion: string };
export type Opcion = { clave: string; puntaje: number; dias: number };
export type Sugerencia = { opciones: Opcion[]; elegida: string | null; /** única opción posible para ambos lados */ segura: boolean };

export const VENTANA_DIAS = 3;
const DIA_MS = 86_400_000;

export const diasEntre = (a: string, b: string) => Math.round((aDate(a).getTime() - aDate(b).getTime()) / DIA_MS);

/** Parecido entre dos textos, de 0 a 1 (palabras en común). */
export function similitud(a: string, b: string): number {
  const pa = new Set(normalizar(a).split(" ").filter((p) => p.length > 2)), pb = new Set(normalizar(b).split(" ").filter((p) => p.length > 2));
  if (!pa.size || !pb.size) return 0;
  let comunes = 0;
  for (const p of pa) if (pb.has(p)) comunes++;
  return comunes / Math.min(pa.size, pb.size);
}

/** Propone la pareja de cada línea: mismo importe exacto, fecha dentro de la ventana, y entre varias opciones gana la más
 *  cercana en fecha y en descripción. Cada movimiento del sistema se usa una sola vez. */
export function sugerir(lineas: LineaPendiente[], candidatos: Candidato[], ventana = VENTANA_DIAS): Map<string, Sugerencia> {
  const opciones = new Map<string, Opcion[]>();
  const usos = new Map<string, number>();
  for (const l of lineas) {
    const lista: Opcion[] = [];
    for (const c of candidatos) {
      if (c.montoCentavos !== l.montoCentavos) continue;
      const dias = Math.abs(diasEntre(l.fecha, c.fecha));
      if (dias > ventana) continue;
      lista.push({ clave: c.clave, dias, puntaje: 100 - dias * 10 + Math.round(similitud(l.descripcion, c.texto) * 20) });
      usos.set(c.clave, (usos.get(c.clave) ?? 0) + 1);
    }
    lista.sort((a, b) => b.puntaje - a.puntaje || a.clave.localeCompare(b.clave));
    opciones.set(l.id, lista);
  }
  // Asignación voraz por puntaje: la mejor pareja global primero
  const pares = lineas.flatMap((l) => (opciones.get(l.id) ?? []).map((o) => ({ linea: l.id, ...o })))
    .sort((a, b) => b.puntaje - a.puntaje || a.linea.localeCompare(b.linea) || a.clave.localeCompare(b.clave));
  const lineaUsada = new Set<string>(), candUsado = new Set<string>(), elegida = new Map<string, string>();
  for (const p of pares) {
    if (lineaUsada.has(p.linea) || candUsado.has(p.clave)) continue;
    lineaUsada.add(p.linea); candUsado.add(p.clave); elegida.set(p.linea, p.clave);
  }
  return new Map(lineas.map((l) => {
    const ops = opciones.get(l.id) ?? [];
    const e = elegida.get(l.id) ?? null;
    return [l.id, { opciones: ops, elegida: e, segura: !!e && ops.length === 1 && usos.get(e) === 1 }];
  }));
}
