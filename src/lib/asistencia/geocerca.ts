// Validación de checadas por geolocalización (puro, sin BD).

export type Ubicacion = { id: string; nombre: string; lat: number; lng: number; radioMetros: number };

/** Distancia entre dos coordenadas en metros (haversine). */
export function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Con peor precisión que esto el GPS no dice nada confiable. */
export const PRECISION_MAXIMA_M = 200;

export type Evaluacion =
  | { ok: true; ubicacion: Ubicacion; distanciaM: number }
  | { ok: false; motivo: "sin_ubicaciones" | "gps_debil" | "fuera"; cercana?: Ubicacion; distanciaM?: number };

export function evaluarChecada(lat: number, lng: number, precisionM: number | null, ubicaciones: Ubicacion[]): Evaluacion {
  if (ubicaciones.length === 0) return { ok: false, motivo: "sin_ubicaciones" };
  if (precisionM != null && precisionM > PRECISION_MAXIMA_M) return { ok: false, motivo: "gps_debil" };
  const medidas = ubicaciones.map((u) => ({ u, d: distanciaM(lat, lng, u.lat, u.lng) })).sort((a, b) => a.d - b.d);
  const mejor = medidas[0];
  if (mejor.d <= mejor.u.radioMetros) return { ok: true, ubicacion: mejor.u, distanciaM: mejor.d };
  return { ok: false, motivo: "fuera", cercana: mejor.u, distanciaM: mejor.d };
}

/** Lo siguiente en checar: lo contrario a la última checada del día; sin checadas, entrada. */
export const siguienteTipo = (ultima: "ENTRADA" | "SALIDA" | null): "ENTRADA" | "SALIDA" => (ultima === "ENTRADA" ? "SALIDA" : "ENTRADA");
