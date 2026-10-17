import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let cliente: Anthropic | null = null;

/** Cliente perezoso: sin ANTHROPIC_API_KEY el resto de la app funciona y solo falla la lectura con IA. */
export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");
  return (cliente ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 }));
}

/** Modelo para leer tickets. Se puede cambiar con ANTHROPIC_MODEL_OCR (p. ej. a uno más económico). */
export const MODELO_OCR = process.env.ANTHROPIC_MODEL_OCR || "claude-opus-5-5";
