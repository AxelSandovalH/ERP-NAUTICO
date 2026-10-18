// Cantidades y costos de inventario (puro). Las cantidades son enteros en milésimas de la unidad
// (2.5 L = 2500) y los costos, centavos por unidad entera; los productos se hacen con BigInt para no desbordar.

/** "2.5" → 2500. Acepta hasta 3 decimales; null si no es una cantidad válida. */
export function leerCantidad(texto: string): number | null {
  const t = texto.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const [entero, dec = ""] = t.split(".");
  const milli = Number(entero) * 1000 + Number(dec.padEnd(3, "0"));
  return Number.isSafeInteger(milli) && milli <= 2_000_000_000 ? milli : null;
}

/** 2500 → "2.5". Sin ceros sobrantes. */
export function cantidadTexto(milli: number): string {
  const signo = milli < 0 ? "-" : "";
  const a = Math.abs(milli);
  const entero = Math.floor(a / 1000), dec = String(a % 1000).padStart(3, "0").replace(/0+$/, "");
  return `${signo}${entero.toLocaleString("es-MX")}${dec ? `.${dec}` : ""}`;
}

/** Valor de `cantidadMilli` unidades a `costoUnitarioCentavos` cada una, en centavos (redondeado). */
export function valorCentavos(cantidadMilli: number, costoUnitarioCentavos: number): number {
  const p = BigInt(cantidadMilli) * BigInt(costoUnitarioCentavos);
  const neg = p < BigInt(0), a = neg ? -p : p;
  const r = (a + BigInt(500)) / BigInt(1000);
  return Number(neg ? -r : r);
}

/** Costo por unidad que sale de pagar `totalCentavos` por `cantidadMilli` unidades (redondeado). */
export function costoUnitario(totalCentavos: number, cantidadMilli: number): number {
  if (cantidadMilli <= 0) return 0;
  return Number((BigInt(totalCentavos) * BigInt(1000) + BigInt(Math.floor(cantidadMilli / 2))) / BigInt(cantidadMilli));
}

export type Compra = { cantidadMilli: number; costoUnitarioCentavos: number };
/** Costo promedio ponderado de las compras vigentes (centavos por unidad). 0 si no hay compras. */
export function costoPromedio(compras: Compra[]): number {
  let cant = BigInt(0), valor = BigInt(0);
  for (const c of compras) { cant += BigInt(c.cantidadMilli); valor += BigInt(c.cantidadMilli) * BigInt(c.costoUnitarioCentavos); }
  if (cant <= BigInt(0)) return 0;
  return Number((valor + cant / BigInt(2)) / cant);
}

/** ¿Está por debajo del mínimo? Un mínimo en cero significa «sin alerta». */
export const porReabastecer = (existenciaMilli: number, minimoMilli: number) => minimoMilli > 0 && existenciaMilli < minimoMilli;
