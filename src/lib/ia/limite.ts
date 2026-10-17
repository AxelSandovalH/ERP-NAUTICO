/** Limitador de uso en memoria (ventana deslizante). Protege el gasto de la API de IA de abusos o
 *  bucles. En serverless cada instancia lleva su propia cuenta, así que es una barrera práctica,
 *  no una garantía global. */
export function crearLimitador(max: number, ventanaMs: number) {
  const usos = new Map<string, number[]>();
  return {
    /** true si todavía hay cupo (y lo consume); false si ya se agotó. */
    intentar(clave: string, ahora = Date.now()): boolean {
      const recientes = (usos.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
      if (recientes.length >= max) { usos.set(clave, recientes); return false; }
      recientes.push(ahora);
      usos.set(clave, recientes);
      return true;
    },
  };
}
