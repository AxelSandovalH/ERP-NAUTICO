import Link from "next/link";

const TABS = [
  { href: "/inventario", etiqueta: "Existencias" },
  { href: "/inventario/movimientos", etiqueta: "Movimientos" },
  { href: "/inventario/conteo", etiqueta: "Conteo físico" },
  { href: "/inventario/articulos", etiqueta: "Artículos y ubicaciones" },
] as const;

export function SubnavInventario({ activo }: { activo: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Inventario" className="mb-5 flex flex-wrap gap-2 text-sm">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === activo ? "page" : undefined} className={`rounded-full border px-3 py-1 ${t.href === activo ? "border-brand bg-brand-soft font-medium" : "border-line hover:bg-brand-soft/50"}`}>{t.etiqueta}</Link>
      ))}
    </nav>
  );
}
