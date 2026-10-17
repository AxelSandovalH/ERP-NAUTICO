import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hoyIso } from "@/lib/fechas";
import type { MimePermitido } from "@/lib/storage/reglas";
import { anthropic, MODELO_OCR } from "./cliente";
import { ESQUEMA_TICKET, INSTRUCCION_TICKET, normalizarTicket, type TicketLeido } from "./ticket";

export type ResultadoLectura = { ok: true; ticket: TicketLeido } | { ok: false; error: string };

/** Lee un ticket (foto o PDF) con visión de Claude y devuelve los campos para prellenar el gasto. */
export async function leerTicketConClaude(a: { datosBase64: string; mime: MimePermitido; categorias: string[]; zona: string }): Promise<ResultadoLectura> {
  const archivo =
    a.mime === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.datosBase64 } } as const)
      : ({ type: "image", source: { type: "base64", media_type: a.mime, data: a.datosBase64 } } as const);
  try {
    const r = await anthropic().messages.create({
      model: MODELO_OCR,
      max_tokens: 2000,
      // Leer un ticket no necesita razonar a fondo: esfuerzo bajo = más rápido y barato
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_TICKET as unknown as Record<string, unknown> } },
      messages: [{ role: "user", content: [archivo, { type: "text", text: INSTRUCCION_TICKET(a.categorias) }] }],
    });
    if (r.stop_reason === "refusal") return { ok: false, error: "No se pudo leer ese documento. Captura el gasto a mano." };
    if (r.stop_reason === "max_tokens") return { ok: false, error: "La lectura se cortó. Inténtalo con una foto más clara o captura a mano." };
    const bloque = r.content.find((b) => b.type === "text");
    if (!bloque || bloque.type !== "text") return { ok: false, error: "No se obtuvo ninguna lectura. Captura el gasto a mano." };
    let crudo: unknown;
    try { crudo = JSON.parse(bloque.text); } catch { return { ok: false, error: "La lectura no fue válida. Inténtalo otra vez." }; }
    return { ok: true, ticket: normalizarTicket(crudo, a.categorias, hoyIso(a.zona)) };
  } catch (e) {
    // El detalle va al log del servidor; al usuario nunca se le muestra la llave ni mensajes internos
    console.error("[ia] lectura de ticket falló:", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "El servicio de lectura está saturado. Inténtalo en un minuto." };
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "La lectura con IA no está bien configurada. Avisa a un administrador." };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: "No se pudo conectar con el servicio de lectura. Inténtalo de nuevo." };
    return { ok: false, error: "No se pudo leer el ticket. Captura el gasto a mano." };
  }
}
