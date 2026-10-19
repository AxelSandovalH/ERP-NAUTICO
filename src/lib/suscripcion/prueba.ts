// Periodo de prueba (puro, sin BD). Una empresa nueva empieza en el plan «Prueba» con todo disponible durante 7 días.
export const DIAS_PRUEBA = 7;
const DIA_MS = 86_400_000;

/** Cuándo termina la prueba de una empresa que empieza `desde`. */
export const finDePrueba = (desde: Date = new Date()) => new Date(desde.getTime() + DIAS_PRUEBA * DIA_MS);

/** ¿Ya se acabó la prueba? Solo aplica al plan Prueba con fecha de fin; un plan de pago nunca está «en prueba». */
export function pruebaVencida(plan: string, termina: Date | null | undefined, ahora: Date = new Date()): boolean {
  return plan === "PRUEBA" && !!termina && ahora.getTime() > termina.getTime();
}

/** Días que le quedan (se redondea hacia arriba: con 2 horas restantes aún queda «1 día»). 0 si ya venció o no hay fecha. */
export function diasRestantes(termina: Date | null | undefined, ahora: Date = new Date()): number {
  if (!termina) return 0;
  return Math.max(0, Math.ceil((termina.getTime() - ahora.getTime()) / DIA_MS));
}
