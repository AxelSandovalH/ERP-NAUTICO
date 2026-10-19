import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Cifrado en reposo de las llaves de API de Procura (AES-256-GCM). La clave vive solo en el servidor
// (PROCURA_CLAVE_CIFRADO: 32 bytes en base64). Formato guardado: v1.<iv>.<etiqueta>.<texto cifrado>, todo en base64.

function claveDe(clave?: string): Buffer {
  const b64 = clave ?? process.env.PROCURA_CLAVE_CIFRADO;
  if (!b64) throw new Error("Falta PROCURA_CLAVE_CIFRADO");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("PROCURA_CLAVE_CIFRADO debe ser de 32 bytes en base64");
  return k;
}

export function cifrar(texto: string, clave?: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", claveDe(clave), iv);
  const ct = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

/** Descifra. Falla (sin revelar nada) si el texto fue alterado o la clave no corresponde. */
export function descifrar(guardado: string, clave?: string): string {
  const [v, iv, tag, ct] = guardado.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Formato de llave no reconocido");
  const d = createDecipheriv("aes-256-gcm", claveDe(clave), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  try { return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8"); } catch { throw new Error("No se pudo descifrar la llave"); }
}
