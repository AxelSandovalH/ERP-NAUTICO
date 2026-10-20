const dinero = (c: number, moneda: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda }).format(c / 100);

/** Comparación de magnitudes entre categorías sin orden natural: una sola serie, un solo color, valor en la punta.
 *  Cada barra se puede enfocar con el teclado y muestra su parte del total. */
export function BarrasHorizontales({ items, moneda, variable = "--serie-1" }: { items: { etiqueta: string; centavos: number; color?: string }[]; moneda: string; variable?: string }) {
  const max = Math.max(...items.map((i) => i.centavos), 1), total = items.reduce((s, i) => s + i.centavos, 0);
  if (items.length === 0) return <p className="text-sm text-muted">Sin movimientos en este periodo.</p>;
  return (
    <ul className="space-y-3.5">
      {items.map((i) => (
        <li key={i.etiqueta} tabIndex={0} className="group relative rounded text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-2 truncate text-muted">{i.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: i.color }} />}{i.etiqueta}</span>
            <span className="font-medium">{dinero(i.centavos, moneda)}</span>
          </div>
          {/* Barra fina a todo el ancho de la tarjeta: 4px redondeado en la punta, cuadrada en la base */}
          <span className="block h-2.5">
            <span className="block h-full transition-opacity group-hover:opacity-80" style={{ width: `${Math.max((i.centavos / max) * 100, 1.5)}%`, background: i.color ?? `var(${variable})`, borderRadius: "0 4px 4px 0" }} />
          </span>
          <span role="tooltip" className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg group-hover:block group-focus-visible:block">
            <strong className="block text-sm">{dinero(i.centavos, moneda)}</strong>
            <span className="text-muted">{i.etiqueta} · {Math.round((i.centavos / total) * 100)}% del total</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
