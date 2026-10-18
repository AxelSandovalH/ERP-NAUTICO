// Periodos de los reportes (puro). Siempre meses completos, salvo "este mes" que llega hasta hoy.
import { mesDe, sumarMeses } from "@/lib/fechas";

export const RANGOS = {
  este_mes: "Este mes",
  mes_pasado: "Mes pasado",
  tres_meses: "Últimos 3 meses",
  seis_meses: "Últimos 6 meses",
  este_anio: "Este año",
  doce_meses: "Últimos 12 meses",
} as const;
export type RangoId = keyof typeof RANGOS;
export const RANGO_POR_DEFECTO: RangoId = "seis_meses";
export const esRango = (r: unknown): r is RangoId => typeof r === "string" && r in RANGOS;

export type Periodo = {
  id: RangoId;
  etiqueta: string;
  /** Primer y último día (inclusive), YYYY-MM-DD */
  desde: string;
  hasta: string;
  /** El periodo inmediato anterior, de la misma duración en meses */
  anteriorDesde: string;
  anteriorHasta: string;
  /** Meses que abarca, YYYY-MM, en orden */
  meses: string[];
};

const ultimoDia = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/** `hoy` en la zona de la empresa. El periodo en curso se corta en hoy; el anterior es el equivalente completo. */
export function periodoDe(id: RangoId, hoy: string): Periodo {
  const actual = mesDe(hoy);
  let primero: string, ultimo: string;
  switch (id) {
    case "este_mes": primero = ultimo = actual; break;
    case "mes_pasado": primero = ultimo = sumarMeses(actual, -1); break;
    case "tres_meses": primero = sumarMeses(actual, -2); ultimo = actual; break;
    case "seis_meses": primero = sumarMeses(actual, -5); ultimo = actual; break;
    case "este_anio": primero = `${actual.slice(0, 4)}-01`; ultimo = actual; break;
    case "doce_meses": primero = sumarMeses(actual, -11); ultimo = actual; break;
  }
  const meses: string[] = [];
  for (let m = primero; m <= ultimo; m = sumarMeses(m, 1)) meses.push(m);
  const n = meses.length;
  const anteriorPrimero = sumarMeses(primero, -n), anteriorUltimo = sumarMeses(primero, -1);
  const enCurso = ultimo === actual;
  const finActual = enCurso ? hoy : ultimoDia(ultimo);
  // Un periodo en curso se compara con el mismo tramo del anterior (hasta el mismo día), no con el anterior completo
  let anteriorHasta = ultimoDia(anteriorUltimo);
  if (enCurso) {
    const mesCorte = sumarMeses(actual, -n), dia = Number(hoy.slice(8)), tope = Number(ultimoDia(mesCorte).slice(8));
    anteriorHasta = `${mesCorte}-${String(Math.min(dia, tope)).padStart(2, "0")}`;
  }
  return { id, etiqueta: RANGOS[id], desde: `${primero}-01`, hasta: finActual, anteriorDesde: `${anteriorPrimero}-01`, anteriorHasta, meses };
}
