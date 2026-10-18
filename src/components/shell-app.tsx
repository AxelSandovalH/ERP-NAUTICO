"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Banknote, Boxes, CalendarClock, CalendarDays, Landmark, Receipt, TrendingUp, Wallet, ClipboardList, Clock, LayoutDashboard, LogOut, Percent, Settings, Ship, Users, UsersRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Logo, LogoMarca } from "./logo";

const ICONOS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/configuracion": Settings,
  "/calendario": CalendarDays,
  "/reservas": ClipboardList,
  "/clientes": Users,
  "/flota": Ship,
  "/tripulacion": UsersRound,
  "/comisiones": Percent,
  "/asistencia": Clock,
  "/nomina": Banknote,
  "/cuentas": Wallet,
  "/gastos": Receipt,
  "/ingresos": TrendingUp,
  "/conciliacion": Landmark,
  "/reportes": BarChart3,
  "/inventario": Boxes,
  "/horarios": CalendarClock,
  "/horarios/mio": CalendarClock,
};

type Props = {
  nav: { href: string; etiqueta: string }[];
  tenantNombre: string;
  usuarioNombre: string;
  salir: () => Promise<void>;
  children: ReactNode;
};

/** Marco de la app. En el calendario la barra lateral pasa a un riel de íconos y
 *  el contenido ocupa todo el ancho: la cuadrícula necesita cada pixel. */
export function ShellApp({ nav, tenantNombre, usuarioNombre, salir, children }: Props) {
  const pathname = usePathname();
  const compacto = pathname.startsWith("/calendario");
  return (
    <div className={`min-h-screen md:grid ${compacto ? "md:grid-cols-[64px_1fr]" : "md:grid-cols-[230px_1fr]"}`}>
      <aside className="border-b border-line bg-surface md:min-h-screen md:border-b-0 md:border-r">
        <div className={`flex items-center justify-between px-4 py-3 md:block md:py-5 ${compacto ? "md:px-0 md:text-center" : ""}`}>
          {compacto ? (
            <>
              <LogoMarca className="mx-auto hidden h-5 w-auto md:block" titulo="ERP Náutico" />
              <div className="md:hidden"><Logo /></div>
            </>
          ) : (
            <div>
              <Logo />
              <p className="mt-1 truncate text-xs text-muted">{tenantNombre}</p>
            </div>
          )}
        </div>
        <nav className={`flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3 ${compacto ? "md:items-center md:px-1" : ""}`}>
          {nav.map((n) => {
            const Icono = ICONOS[n.href] ?? ClipboardList;
            const activo = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link key={n.href} href={n.href} title={n.etiqueta} aria-label={n.etiqueta}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-brand-soft ${activo ? "bg-brand-soft text-brand" : ""} ${compacto ? "md:h-10 md:w-10 md:justify-center md:px-0" : ""}`}>
                <Icono className="h-4 w-4 shrink-0" />
                <span className={compacto ? "md:hidden" : ""}>{n.etiqueta}</span>
              </Link>
            );
          })}
        </nav>
        <form action={salir} className={`px-3 pb-3 md:pt-4 ${compacto ? "md:flex md:justify-center md:px-0" : ""}`}>
          {!compacto && <p className="truncate px-3 text-xs text-muted">{usuarioNombre}</p>}
          <button title="Cerrar sesión" aria-label="Cerrar sesión"
            className={`mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-brand-soft ${compacto ? "md:h-10 md:w-10 md:justify-center md:px-0" : "w-full"}`}>
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={compacto ? "md:hidden" : ""}>Cerrar sesión</span>
          </button>
        </form>
      </aside>
      <main className={compacto ? "w-full min-w-0 px-2 py-2 md:px-3 md:py-3" : "mx-auto w-full min-w-0 max-w-6xl px-4 py-6 md:px-8"}>{children}</main>
    </div>
  );
}
