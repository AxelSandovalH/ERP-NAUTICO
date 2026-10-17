// Reglas de los comprobantes (puro, sin BD ni red): qué se acepta y cómo se nombran las rutas.

export const BUCKET = "comprobantes";
export const MIMES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" } as const;
export type MimePermitido = keyof typeof MIMES;
export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB por archivo
export const MAX_POR_GASTO = 8;

export const esMimePermitido = (m: string): m is MimePermitido => m in MIMES;

/** null = válido; si no, el motivo en español para mostrar al usuario. */
export function validarArchivo(a: { mime: string; tamano: number }): string | null {
  if (!esMimePermitido(a.mime)) return "Solo se aceptan fotos (JPG, PNG, WebP) y PDF.";
  if (!Number.isFinite(a.tamano) || a.tamano <= 0) return "El archivo está vacío.";
  if (a.tamano > MAX_BYTES) return `El archivo pesa más de ${MAX_BYTES / 1024 / 1024} MB.`;
  return null;
}

/** Ruta dentro del bucket: <empresa>/<gasto>/<id>.<ext>. La carpeta de la empresa aísla los datos. */
export const nuevaRuta = (tenantId: string, gastoId: string, mime: MimePermitido, id: string) => `${tenantId}/${gastoId}/${id}.${MIMES[mime]}`;

/** ¿La ruta es de este gasto y de esta empresa? Evita registrar archivos ajenos o rutas con `..`. */
export function rutaPerteneceA(ruta: string, tenantId: string, gastoId: string): boolean {
  const partes = ruta.split("/");
  if (partes.length !== 3 || partes.some((p) => p === "" || p === "." || p === "..")) return false;
  const [t, g, archivo] = partes;
  return t === tenantId && g === gastoId && /^[A-Za-z0-9-]+\.(jpg|png|webp|pdf)$/.test(archivo);
}

/** Nombre original apto para mostrar: sin rutas ni caracteres de control, acotado. */
export function nombreSeguro(n: string): string {
  const base = n.split(/[\\/]/).pop() ?? "archivo";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120) || "archivo";
}

/** Tipo real del archivo según sus primeros bytes (no se confía en el tipo que declara el navegador). */
export function tipoRealDe(b: Uint8Array): MimePermitido | null {
  const asc = (i: number, t: string) => t.split("").every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && asc(1, "PNG") && b[4] === 0x0d && b[5] === 0x0a) return "image/png";
  if (b.length >= 12 && asc(0, "RIFF") && asc(8, "WEBP")) return "image/webp";
  if (b.length >= 5 && asc(0, "%PDF-")) return "application/pdf";
  return null;
}
