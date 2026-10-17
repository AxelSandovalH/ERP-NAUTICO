// Cálculo de nómina (puro, sin BD). Dinero en centavos enteros.

export type EstadoDia = "TRABAJO" | "DESCANSO" | "VACACIONES" | "INCAPACIDAD" | "PERMISO" | "FALTA";
export type EsquemaPago = "FIJO_PERIODO" | "POR_DIA";
export type DiaClasificado = { fecha: string; estado: EstadoDia | "SIN_REGISTRO"; origen: "checada" | "manual" | "ninguno" };

/** Qué dice cada día: la corrección manual manda; si no hay, una checada de entrada
 *  cuenta como trabajo; si tampoco, queda SIN_REGISTRO (para que alguien lo revise). */
export function clasificarDias(dias: string[], diasConEntrada: Set<string>, manual: Map<string, EstadoDia>): DiaClasificado[] {
  return dias.map((fecha) => {
    const m = manual.get(fecha);
    if (m) return { fecha, estado: m, origen: "manual" as const };
    if (diasConEntrada.has(fecha)) return { fecha, estado: "TRABAJO" as const, origen: "checada" as const };
    return { fecha, estado: "SIN_REGISTRO" as const, origen: "ninguno" as const };
  });
}

export type Conteos = { trabajados: number; falta: number; sinRegistro: number; descanso: number; incapacidad: number };

/** `trabajados` incluye vacaciones (se pagan); `falta` incluye permisos sin goce (no se pagan).
 *  Con `hoy`, solo los días ya cerrados (anteriores a hoy) pueden quedar "sin registro": hoy y los
 *  días por venir no, porque el periodo sigue en curso. */
export function contar(dias: DiaClasificado[], hoy?: string): Conteos {
  const c: Conteos = { trabajados: 0, falta: 0, sinRegistro: 0, descanso: 0, incapacidad: 0 };
  for (const d of dias) {
    if (d.estado === "TRABAJO" || d.estado === "VACACIONES") c.trabajados++;
    else if (d.estado === "FALTA" || d.estado === "PERMISO") c.falta++;
    else if (d.estado === "SIN_REGISTRO") { if (!hoy || d.fecha < hoy) c.sinRegistro++; }
    else if (d.estado === "DESCANSO") c.descanso++;
    else if (d.estado === "INCAPACIDAD") c.incapacidad++;
  }
  return c;
}

export type ResultadoBruto = { brutoCentavos: number; descuentoFaltasCentavos: number; descripcionDescuento?: string };

/** POR_DIA: se paga cada día trabajado. FIJO_PERIODO: se paga el sueldo completo y cada
 *  falta descuenta 1/díasDelPeriodo. Los días sin registro no penalizan (se avisan). */
export function calcularBruto(e: { esquema: EsquemaPago; sueldoCentavos: number; diasPeriodo: number; conteos: Conteos }): ResultadoBruto {
  if (e.esquema === "POR_DIA") return { brutoCentavos: e.sueldoCentavos * e.conteos.trabajados, descuentoFaltasCentavos: 0 };
  const descuento = e.diasPeriodo > 0 ? Math.min(e.sueldoCentavos, Math.round((e.sueldoCentavos * e.conteos.falta) / e.diasPeriodo)) : 0;
  return {
    brutoCentavos: e.sueldoCentavos,
    descuentoFaltasCentavos: descuento,
    descripcionDescuento: descuento > 0 ? `Faltas y permisos sin goce (${e.conteos.falta} ${e.conteos.falta === 1 ? "día" : "días"})` : undefined,
  };
}

/** Neto = bruto + bonos − deducciones, nunca negativo. */
export const netoDe = (bruto: number, bonos: number, deducciones: number) => Math.max(0, bruto + bonos - deducciones);
