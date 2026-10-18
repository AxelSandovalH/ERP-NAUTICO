import Link from "next/link";

const TABS = [
  { href: "/horarios", etiqueta: "Semana" },
  { href: "/horarios/turnos", etiqueta: "Turnos" },
  { href: "/horarios/equipo", etiqueta: "Equipo" },
] as const;

export function SubnavHorarios({ activo }: { activo: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Horarios" className="mb-5 flex gap-2 text-sm">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === activo ? "page" : undefined} className={`rounded-full border px-3 py-1 ${t.href === activo ? "border-brand bg-brand-soft font-medium" : "border-line hover:bg-brand-soft/50"}`}>{t.etiqueta}</Link>
      ))}
    </nav>
  );
}
