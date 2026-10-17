// Qué color de texto se lee sobre un fondo dado. Los colores de barco se eligen
// para distinguirse entre sí, no para llevar letras encima: muchos no dan
// contraste suficiente con blanco (WCAG pide 4.5:1).

/** Luminancia relativa (WCAG 2.1). */
function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const canal = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

/** true = el fondo es claro y hay que escribir en oscuro (el texto blanco bajaría de 4.5:1). */
export function fondoClaro(hex: string | null | undefined): boolean {
  if (!hex) return false;
  return 1.05 / (luminancia(hex) + 0.05) < 4.5;
}
