// Emparejamiento sugerido entre gastos que «requieren factura» y facturas recibidas de proveedores (puro, sin BD).
import { diasEntre, similitud } from "@/lib/conciliacion/sugerir";

export type CfdiRecibido = {
  id: string; uuid: string; rfcEmisor: string; nombreEmisor: string | null;
  totalCentavos: number; moneda: string; emitidoEn: string; tipo: string | null; estadoSat: string | null;
};
export type GastoPendiente = { id: string; fecha: string; montoCentavos: number; moneda: string; texto: string };
export type Opcion = { cfdiId: string; puntaje: number; dias: number };
export type Sugerencia = { opciones: Opcion[]; elegida: string | null; /** única opción posible para ambos lados */ segura: boolean };

/** Diferencia máxima de importe que se acepta entre el gasto y el CFDI (centavos): los redondeos y propinas no deben estorbar. */
export const TOLERANCIA_CENTAVOS = 100;
/** La factura suele llegar después del gasto, pero a veces antes. */
export const DIAS_ANTES = 7, DIAS_DESPUES = 60;

/** Solo sirven los CFDI de ingreso del proveedor (tipo I) y vigentes; los de pago, nómina o cancelados no respaldan un gasto. */
export const esFacturaUtil = (c: CfdiRecibido) => (c.tipo ?? "I").toUpperCase() === "I" && (c.estadoSat ?? "").toUpperCase() !== "CANCELADO" && (c.estadoSat ?? "").toUpperCase() !== "CANCELANDO";

export function sugerirFacturas(gastos: GastoPendiente[], cfdis: CfdiRecibido[], tol = TOLERANCIA_CENTAVOS): Map<string, Sugerencia> {
  const utiles = cfdis.filter(esFacturaUtil);
  const usos = new Map<string, number>(), opciones = new Map<string, Opcion[]>();
  for (const g of gastos) {
    const lista: Opcion[] = [];
    for (const c of utiles) {
      if (c.moneda !== g.moneda) continue;
      const dif = Math.abs(c.totalCentavos - g.montoCentavos);
      if (dif > tol) continue;
      const dias = diasEntre(c.emitidoEn, g.fecha); // + si la factura es posterior al gasto
      if (dias < -DIAS_ANTES || dias > DIAS_DESPUES) continue;
      const puntaje = 60 + (dif === 0 ? 20 : Math.round(10 - (dif / tol) * 10)) + Math.max(0, 10 - Math.floor(Math.abs(dias) / 6)) + Math.round(similitud(g.texto, c.nombreEmisor ?? "") * 20);
      lista.push({ cfdiId: c.id, puntaje, dias });
      usos.set(c.id, (usos.get(c.id) ?? 0) + 1);
    }
    lista.sort((a, b) => b.puntaje - a.puntaje || a.cfdiId.localeCompare(b.cfdiId));
    opciones.set(g.id, lista);
  }
  // Asignación voraz por puntaje; una factura respalda un solo gasto
  const pares = gastos.flatMap((g) => (opciones.get(g.id) ?? []).map((o) => ({ gasto: g.id, ...o })))
    .sort((a, b) => b.puntaje - a.puntaje || a.gasto.localeCompare(b.gasto) || a.cfdiId.localeCompare(b.cfdiId));
  const gastoUsado = new Set<string>(), cfdiUsado = new Set<string>(), elegida = new Map<string, string>();
  for (const p of pares) {
    if (gastoUsado.has(p.gasto) || cfdiUsado.has(p.cfdiId)) continue;
    gastoUsado.add(p.gasto); cfdiUsado.add(p.cfdiId); elegida.set(p.gasto, p.cfdiId);
  }
  return new Map(gastos.map((g) => {
    const ops = opciones.get(g.id) ?? [], e = elegida.get(g.id) ?? null;
    return [g.id, { opciones: ops, elegida: e, segura: !!e && ops.length === 1 && usos.get(e) === 1 }];
  }));
}

/** ¿El CFDI puede respaldar este gasto? Devuelve el motivo si no. */
export function motivoIncompatible(g: Pick<GastoPendiente, "montoCentavos" | "moneda">, c: CfdiRecibido, tol = TOLERANCIA_CENTAVOS): string | null {
  if (!esFacturaUtil(c)) return "Esa factura no es un comprobante de ingreso vigente.";
  if (c.moneda !== g.moneda) return `La factura está en ${c.moneda} y el gasto en ${g.moneda}.`;
  if (Math.abs(c.totalCentavos - g.montoCentavos) > tol) return "El total de la factura no coincide con el del gasto.";
  return null;
}
