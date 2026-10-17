// Monedas y conversiones (puro, sin BD). Dinero en centavos enteros. El tipo de cambio
// es "pesos por dólar" (p. ej. 17.5): un dólar vale 17.5 pesos.

export type Moneda = "MXN" | "USD";
export const MONEDAS: Moneda[] = ["MXN", "USD"];
export const esMoneda = (m: string): m is Moneda => m === "MXN" || m === "USD";

/** Convierte `monto` (centavos) de una moneda a otra con el tipo de cambio dado. */
export function convertir(monto: number, de: Moneda, a: Moneda, tipoCambio: number): number {
  if (de === a) return monto;
  return de === "USD" ? Math.round(monto * tipoCambio) : Math.round(monto / tipoCambio);
}

export const tipoCambioValido = (tc: unknown): tc is number => typeof tc === "number" && Number.isFinite(tc) && tc >= 0.01 && tc <= 1000;

export type Movimiento = { montoCentavos: number; moneda: Moneda; tipoCambio: number | null; montoBaseCentavos: number };

/** Arma un movimiento a partir de la cuenta y UNO de los dos montos:
 *  - `montoCentavos` (en la moneda de la cuenta): calcula su equivalente en la moneda base;
 *  - `montoBaseCentavos` (en la moneda base, p. ej. un pago de nómina): calcula cuánto
 *    sale de la cuenta en su moneda. Sin cambio de moneda no hay tipo de cambio. */
export function armarMovimiento(
  cuentaMoneda: Moneda, base: Moneda, tipoCambioConfig: number,
  e: { montoCentavos: number; tipoCambio?: number | null } | { montoBaseCentavos: number; tipoCambio?: number | null },
): Movimiento {
  const mismo = cuentaMoneda === base;
  const tc = mismo ? null : (e.tipoCambio ?? tipoCambioConfig);
  if (tc !== null && !tipoCambioValido(tc)) throw new Error("Tipo de cambio inválido");
  if ("montoCentavos" in e) {
    return { montoCentavos: e.montoCentavos, moneda: cuentaMoneda, tipoCambio: tc, montoBaseCentavos: mismo ? e.montoCentavos : convertir(e.montoCentavos, cuentaMoneda, base, tc!) };
  }
  return { montoCentavos: mismo ? e.montoBaseCentavos : convertir(e.montoBaseCentavos, base, cuentaMoneda, tc!), moneda: cuentaMoneda, tipoCambio: tc, montoBaseCentavos: e.montoBaseCentavos };
}

export type Agregados = { saldoInicial: number; ingresos: number; gastos: number; traspasosEntrada: number; traspasosSalida: number; ajustes: number };

/** Saldo de una cuenta: lo que tenía + lo que entró − lo que salió ± ajustes de arqueo. */
export const saldoDe = (a: Agregados) => a.saldoInicial + a.ingresos - a.gastos + a.traspasosEntrada - a.traspasosSalida + a.ajustes;

/** Diferencia de un arqueo: sobrante (+) o faltante (−) respecto a lo que decía el sistema. */
export const diferenciaArqueo = (teorico: number, contado: number) => contado - teorico;
