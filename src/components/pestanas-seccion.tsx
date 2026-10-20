import Link from "next/link";

/** Pestañas de una sección de la barra (p. ej. Calendario · Reservas · Clientes). La activa es la más específica que coincide con la ruta. */
export function PestanasSeccion({ tabs, pathname, compacta }: { tabs: { href: string; etiqueta: string }[]; pathname: string; compacta?: boolean }) {
  const coincide = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
  const activa = tabs.filter((t) => coincide(t.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Secciones" className={`flex min-w-0 gap-1 overflow-x-auto text-sm ${compacta ? "" : "mb-5 border-b border-line"}`}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === activa ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 ${t.href === activa ? "border-brand font-semibold text-brand" : "border-transparent text-muted hover:text-foreground"}`}>
          {t.etiqueta}
        </Link>
      ))}
    </nav>
  );
}
