import Link from "next/link";
import { requireSesion } from "@/lib/auth/session";
import { navDe } from "@/modules/registry";
import { salir } from "../(auth)/actions";


export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSesion();
  const nav = navDe(s.modulos, s.rol);
  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
      <aside className="border-b border-line bg-surface md:min-h-screen md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-3 md:block md:py-5">
          <div>
            <p className="text-lg font-semibold">⚓ ERP Náutico</p>
            <p className="truncate text-xs text-muted">{s.tenantNombre}</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-brand-soft">
              {n.etiqueta}
            </Link>
          ))}
        </nav>
        <form action={salir} className="px-3 pb-3 md:pt-4">
          <p className="truncate px-3 text-xs text-muted">{s.nombre}</p>
          <button className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-brand-soft">Cerrar sesión</button>
        </form>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
