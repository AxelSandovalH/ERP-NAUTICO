// Del renglón de texto del banco a una línea normalizada (puro, sin BD). Se ejecuta en el navegador
// para mostrar la vista previa y otra vez en el servidor para validar lo que llega.
import { aIso, aDate, esIso } from "@/lib/fechas";

export type LineaBanco = { fecha: string; descripcion: string; montoCentavos: number; saldoCentavos: number | null; referencia: string | null };

export type Mapeo = {
  fecha: number;
  descripcion: number;
  /** "unico": una columna con signo (− sale, + entra). "separado": una de cargos y otra de abonos. */
  modo: "unico" | "separado";
  monto: number | null;
  cargo: number | null;
  abono: number | null;
  saldo: number | null;
  referencia: number | null;
  /** Tarjetas de crédito: el estado de cuenta muestra los cargos en positivo. */
  invertir: boolean;
  /** Orden de la fecha cuando es ambigua (05/06/2026). México usa día/mes. */
  ordenFecha: "dmy" | "mdy";
};

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const SINONIMOS: Record<"fecha" | "descripcion" | "monto" | "cargo" | "abono" | "saldo" | "referencia", string[]> = {
  fecha: ["fecha", "fecha operacion", "fecha de operacion", "fecha movimiento", "fecha contable", "date", "dia"],
  descripcion: ["descripcion", "concepto", "detalle", "movimiento", "leyenda", "descripcion del movimiento", "description", "referencia ampliada"],
  monto: ["monto", "importe", "cantidad", "amount", "valor"],
  cargo: ["cargo", "cargos", "retiro", "retiros", "debito", "debitos", "egreso", "salida", "debit"],
  abono: ["abono", "abonos", "deposito", "depositos", "credito", "creditos", "ingreso", "entrada", "credit"],
  saldo: ["saldo", "balance", "saldo final", "saldo disponible"],
  referencia: ["referencia", "folio", "numero de referencia", "no. referencia", "clave de rastreo", "reference", "autorizacion"],
};

/** Primera fila que parece encabezado: tiene al menos dos nombres de columna conocidos. */
export function detectarEncabezado(filas: string[][]): number {
  const conocidos = new Set(Object.values(SINONIMOS).flat());
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    if (filas[i].filter((c) => conocidos.has(sinAcentos(c))).length >= 2) return i;
  }
  return 0;
}

/** Propone el mapeo de columnas a partir de los encabezados. */
export function detectarMapeo(encabezados: string[]): Mapeo {
  const hallar = (campo: keyof typeof SINONIMOS) => {
    const n = encabezados.map(sinAcentos);
    const exacto = n.findIndex((h) => SINONIMOS[campo].includes(h));
    if (exacto >= 0) return exacto;
    const parcial = n.findIndex((h) => SINONIMOS[campo].some((s) => s.length > 3 && h.includes(s)));
    return parcial >= 0 ? parcial : null;
  };
  const cargo = hallar("cargo"), abono = hallar("abono"), monto = hallar("monto");
  const separado = cargo !== null && abono !== null && cargo !== abono;
  const usados = new Set([cargo, abono, monto].filter((x) => x !== null));
  const fecha = hallar("fecha") ?? 0;
  let descripcion = hallar("descripcion");
  if (descripcion === null || descripcion === fecha) descripcion = encabezados.findIndex((_, i) => i !== fecha && !usados.has(i));
  return {
    fecha, descripcion: Math.max(descripcion, 0), modo: separado || monto === null ? (separado ? "separado" : "unico") : "unico",
    monto: separado ? null : monto, cargo: separado ? cargo : null, abono: separado ? abono : null,
    saldo: hallar("saldo"), referencia: hallar("referencia"), invertir: false, ordenFecha: "dmy",
  };
}

const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12, jan: 1, apr: 4, aug: 8, dec: 12 };
const iso = (y: number, m: number, d: number) => {
  const a = y < 100 ? 2000 + y : y;
  const s = `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return esIso(s) ? s : null;
};

/** Fecha de texto a YYYY-MM-DD. Acepta 2026-03-05, 05/03/2026, 5-mar-2026, 05/03/26 y 5 de marzo de 2026. */
export function leerFecha(texto: string, orden: "dmy" | "mdy" = "dmy"): string | null {
  const t = sinAcentos(texto).replace(/\s+/g, " ").replace(/ de /g, " ");
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ t].*)?$/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/. ]([a-z]{3,9})[-/. ](\d{2,4})(?:[ t].*)?$/.exec(t);
  if (m) { const mes = MESES[m[2].slice(0, 4)] ?? MESES[m[2].slice(0, 3)] ?? (["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"].indexOf(m[2]) + 1 || undefined); return mes ? iso(+m[3], mes, +m[1]) : null; }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ t].*)?$/.exec(t);
  if (m) return orden === "dmy" ? iso(+m[3], +m[2], +m[1]) : iso(+m[3], +m[1], +m[2]);
  return null;
}

/** Importe de texto a centavos con signo. Acepta $1,234.56, 1.234,56, (500.00), 500.00- y 500.00 CR/DB. */
export function leerMonto(texto: string): number | null {
  let t = texto.trim();
  if (!t) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1); }
  if (/-$/.test(t)) { negativo = true; t = t.slice(0, -1); }
  if (/\b(db|dr|cargo)\b/i.test(t)) negativo = true;
  t = t.replace(/\b(cr|db|dr|cargo|abono|mxn|usd)\b/gi, "").replace(/[$\s]/g, "");
  if (t.startsWith("-")) { negativo = !negativo; t = t.slice(1); } else if (t.startsWith("+")) t = t.slice(1);
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  // El último separador es el decimal si deja 1 o 2 dígitos; si no, son separadores de miles
  const ultimo = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
  let entero = t, dec = "";
  if (ultimo >= 0) {
    const cola = t.slice(ultimo + 1);
    const otro = t.slice(0, ultimo).includes(t[ultimo] === "." ? "," : ".");
    if (cola.length <= 2 || (otro && cola.length !== 3)) { entero = t.slice(0, ultimo); dec = cola; }
    else if (cola.length === 3 && !otro && t.indexOf(t[ultimo]) !== ultimo) { entero = t; dec = ""; }
  }
  entero = entero.replace(/[.,]/g, "");
  if (!/^\d*$/.test(entero) || !/^\d*$/.test(dec)) return null;
  const centavos = Number(entero || "0") * 100 + Number(dec.padEnd(2, "0").slice(0, 2));
  if (!Number.isSafeInteger(centavos) || centavos > 2_000_000_000) return null;
  return negativo ? -centavos : centavos;
}

export type ErrorLinea = { fila: number; motivo: string };

/** Aplica el mapeo a las filas de datos. `primeraFila` es el número visible de la primera fila (para los errores). */
export function aplicarMapeo(filas: string[][], m: Mapeo, primeraFila = 2): { lineas: LineaBanco[]; errores: ErrorLinea[] } {
  const lineas: LineaBanco[] = [], errores: ErrorLinea[] = [];
  const celda = (f: string[], i: number | null) => (i === null || i < 0 ? "" : (f[i] ?? "").trim());
  filas.forEach((f, idx) => {
    const n = primeraFila + idx;
    if (f.every((c) => !c.trim())) return;
    const fecha = leerFecha(celda(f, m.fecha), m.ordenFecha);
    if (!fecha) { errores.push({ fila: n, motivo: `Fecha no válida («${celda(f, m.fecha)}»)` }); return; }
    let monto: number | null;
    if (m.modo === "unico") monto = leerMonto(celda(f, m.monto));
    else {
      const c = leerMonto(celda(f, m.cargo)), a = leerMonto(celda(f, m.abono));
      monto = c || a ? (a ?? 0) - Math.abs(c ?? 0) : (c === null && a === null ? null : 0);
    }
    if (monto === null) { errores.push({ fila: n, motivo: "Importe no válido" }); return; }
    if (monto === 0) return; // renglones informativos
    if (m.invertir) monto = -monto;
    const descripcion = celda(f, m.descripcion).replace(/\s+/g, " ").slice(0, 300);
    if (!descripcion) { errores.push({ fila: n, motivo: "Sin descripción" }); return; }
    lineas.push({ fecha, descripcion, montoCentavos: monto, saldoCentavos: leerMonto(celda(f, m.saldo)), referencia: celda(f, m.referencia).slice(0, 80) || null });
  });
  return { lineas, errores };
}

/** Texto normalizado para comparar descripciones y calcular la huella de una línea. */
export const normalizar = (s: string) => sinAcentos(s).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Clave estable de cada línea. Dos renglones idénticos el mismo día (dos cobros iguales) se distinguen por su
 *  número de ocurrencia, así que importar dos veces el mismo archivo no duplica nada. */
export function clavesDeLineas(lineas: LineaBanco[]): string[] {
  const vistas = new Map<string, number>();
  return lineas.map((l) => {
    const base = `${l.fecha}|${l.montoCentavos}|${normalizar(l.descripcion)}`;
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return `${base}|${n}`;
  });
}

export const mesDe = (fechaIso: string) => fechaIso.slice(0, 7);
export { aIso, aDate };
