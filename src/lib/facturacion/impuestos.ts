// Importes y datos fiscales de una factura (puro, sin BD). El precio de FleetNautic NO incluye IVA: se suma.

export const TASA_IVA = 0.16;

/** Subtotal (sin IVA) → IVA y total, en centavos enteros y redondeando como Procura (por línea, una sola línea). */
export function desglosarIva(subtotalCentavos: number) {
  const iva = Math.round(subtotalCentavos * TASA_IVA);
  return { subtotalCentavos, ivaCentavos: iva, totalCentavos: subtotalCentavos + iva };
}

/** Forma de pago SAT según cómo se cobró en FleetNautic. */
export const FORMA_PAGO_SAT = { EFECTIVO: "01", TRANSFERENCIA: "03", TARJETA: "04" } as const;
export const FORMAS_PAGO_SAT = { "01": "Efectivo", "02": "Cheque nominativo", "03": "Transferencia electrónica", "04": "Tarjeta de crédito", "28": "Tarjeta de débito", "99": "Por definir" } as const;
export const METODOS_PAGO_SAT = { PUE: "Pago en una sola exhibición", PPD: "Pago en parcialidades o diferido" } as const;

export type Receptor = { rfc: string; razonSocial: string; regimenFiscal: string; codigoPostal: string; usoCfdi: string; correo?: string | null };

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
export const normalizarRfc = (r: string) => r.trim().toUpperCase().replace(/\s+/g, "");

/** Primer problema de los datos del receptor, o null. No consulta al SAT: solo revisa el formato. */
export function errorDeReceptor(r: Partial<Receptor>): string | null {
  const rfc = normalizarRfc(r.rfc ?? "");
  if (!RFC_RE.test(rfc)) return "El RFC del cliente no tiene un formato válido (12 caracteres para empresas, 13 para personas).";
  if (!r.razonSocial?.trim()) return "Falta la razón social del cliente, tal como está en su constancia fiscal.";
  if (!/^\d{3}$/.test(r.regimenFiscal ?? "")) return "El régimen fiscal del cliente es de 3 dígitos (por ejemplo 601 o 612).";
  if (!/^\d{5}$/.test(r.codigoPostal ?? "")) return "El código postal fiscal del cliente es de 5 dígitos.";
  if (!/^[A-Z]\d{2}$/.test((r.usoCfdi ?? "").toUpperCase())) return "El uso del CFDI tiene la forma G03, S01…";
  if (r.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.correo)) return "El correo para la factura no es válido.";
  return null;
}

/** Datos fiscales de un cliente al guardarlo: pueden quedar vacíos, pero lo que se capture debe tener formato válido. */
export function errorDeDatosFiscales(d: { rfc?: string; regimenFiscal?: string; codigoPostalFiscal?: string; usoCfdi?: string; correoFactura?: string }): string | null {
  if (d.rfc?.trim() && !RFC_RE.test(normalizarRfc(d.rfc))) return "El RFC no tiene un formato válido (12 caracteres para empresas, 13 para personas).";
  if (d.regimenFiscal?.trim() && !/^\d{3}$/.test(d.regimenFiscal.trim())) return "El régimen fiscal es de 3 dígitos (por ejemplo 601 o 612).";
  if (d.codigoPostalFiscal?.trim() && !/^\d{5}$/.test(d.codigoPostalFiscal.trim())) return "El código postal fiscal es de 5 dígitos.";
  if (d.usoCfdi?.trim() && !/^[A-Z]\d{2}$/.test(d.usoCfdi.trim().toUpperCase())) return "El uso del CFDI tiene la forma G03, S01…";
  if (d.correoFactura?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correoFactura.trim())) return "El correo para la factura no es válido.";
  return null;
}

export const receptorNormalizado = (r: Receptor): Receptor => ({
  rfc: normalizarRfc(r.rfc), razonSocial: r.razonSocial.trim(), regimenFiscal: r.regimenFiscal.trim(), codigoPostal: r.codigoPostal.trim(),
  usoCfdi: r.usoCfdi.trim().toUpperCase(), correo: r.correo?.trim() || null,
});

/** Estado de la factura en FleetNautic a partir del estado SAT que reporta Procura. */
export function estadoDeSat(sat: string | null | undefined): "TIMBRADA" | "CANCELANDO" | "CANCELADA" {
  const s = (sat ?? "").toUpperCase();
  return s === "CANCELADO" ? "CANCELADA" : s === "CANCELANDO" ? "CANCELANDO" : "TIMBRADA";
}

export const ESTADOS_FACTURA = { SOLICITADA: "En proceso", TIMBRADA: "Timbrada", ERROR: "Con error", CANCELANDO: "Cancelando", CANCELADA: "Cancelada" } as const;
export const TONO_FACTURA = { SOLICITADA: "azul", TIMBRADA: "verde", ERROR: "rojo", CANCELANDO: "ambar", CANCELADA: "gris" } as const;
export const MOTIVOS_CANCELACION = { "02": "02 · Comprobante emitido con errores sin relación", "03": "03 · No se llevó a cabo la operación", "01": "01 · Comprobante emitido con errores con relación (indica la que lo sustituye)" } as const;
