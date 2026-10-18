// Reglas de horario de los traslados (puro, sin BD).

/** ¿Dos traslados se solapan en el tiempo? Se compara [inicio, inicio + duración). Uno que empieza justo cuando otro termina no se solapa. */
export const traslapan = (aInicioMin: number, aDuracionMin: number, bInicioMin: number, bDuracionMin: number) =>
  aInicioMin < bInicioMin + bDuracionMin && bInicioMin < aInicioMin + aDuracionMin;

export const TIPOS_TRASLADO = { IDA: "Ida (a la marina)", REGRESO: "Regreso" } as const;
export const ESTADOS_TRASLADO = { PROGRAMADO: "Programado", COMPLETADO: "Completado", CANCELADO: "Cancelado" } as const;
export const TONO_TRASLADO = { PROGRAMADO: "azul", COMPLETADO: "verde", CANCELADO: "gris" } as const;

export const DURACION_MIN = 15, DURACION_MAX = 720;

/** Mensaje de error de los datos de un traslado, o null si están bien. */
export function errorDeTraslado(e: { horaMin: number; duracionMin: number; origen: string; destino: string; pax: number; precioCentavos: number }): string | null {
  if (!Number.isInteger(e.horaMin) || e.horaMin < 0 || e.horaMin >= 1440) return "La hora de recogida es inválida.";
  if (!Number.isInteger(e.duracionMin) || e.duracionMin < DURACION_MIN || e.duracionMin > DURACION_MAX) return `La duración debe estar entre ${DURACION_MIN} y ${DURACION_MAX} minutos.`;
  if (e.origen.trim().length < 2) return "Indica el lugar de recogida.";
  if (e.destino.trim().length < 2) return "Indica el lugar de destino.";
  if (!Number.isInteger(e.pax) || e.pax < 1 || e.pax > 500) return "Indica cuántos pasajeros.";
  if (!Number.isInteger(e.precioCentavos) || e.precioCentavos < 0 || e.precioCentavos > 2_000_000_000) return "El precio es inválido.";
  return null;
}
