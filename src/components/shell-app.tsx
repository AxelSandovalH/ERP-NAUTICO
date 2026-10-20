"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Banknote, Menu, X, FileText, Bus, Landmark, Receipt, TrendingUp, ClipboardList, LayoutDashboard, Percent, Ship, Tag, CalendarDays, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { LogoMarca } from "./logo";
import { MenuCuenta } from "./menu-cuenta";
import { PestanasSeccion } from "./pestanas-seccion";
import type { SeccionNav } from "@/modules/registry";

const ICONOS: Record<string, LucideIcon> = {
  flota: Ship,
  transporte: Bus,
  calendario: CalendarDays,
  ingresos: TrendingUp,
  gastos: Receipt,
  facturacion: FileText,
  conciliacion: Landmark,
  nomina: Banknote,
  comisiones: Percent,
  tarifas: Tag,
  reportes: BarChart3,
  dashboard: LayoutDashboard,
};

type Props = {
  grupos: SeccionNav[][];
  tenantNombre: string;
  usuarioNombre: string;
  usuarioFoto: string | null;
  puedeConfigurar: boolean;
  salir: () => Promise<void>;
  children: ReactNode;
};

// Sobre el fondo navy el bote del logo pasa a blanco (la ola ya es azul pato)
const SOBRE_NAVY = { "--logo-bote": "#ffffff" } as CSSProperties;

/** Marco de la app. En pantallas grandes la barra de módulos es un riel de íconos (80 px) que se despliega al pasar el cursor
 *  (o al navegar con el teclado) por encima del contenido, sin moverlo. En el celular es una barra con un botón de menú. */
export function ShellApp({ grupos, tenantNombre, usuarioNombre, usuarioFoto, puedeConfigurar, salir, children }: Props) {
  const pathname = usePathname();
  const compacto = pathname.startsWith("/calendario");
  // La lista de la flota aprovecha todo el ancho: las tarjetas con foto crecen para llenarlo
  const ancho = pathname === "/flota";
  const seccion = grupos.flat().find((s) => s.rutas.some((r) => pathname === r || pathname.startsWith(`${r}/`)));
  // En el celular el menú está plegado. Se guarda en qué pantalla se abrió: al navegar a otra se cierra solo.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abierto = abiertoEn === pathname;
  const etiqueta = "whitespace-nowrap md:opacity-0 md:transition-opacity md:duration-150 md:group-hover/rail:opacity-100 md:group-focus-within/rail:opacity-100";
  return (
    <div className="min-h-screen md:pl-20">
      <aside
        style={SOBRE_NAVY}
        className="group/rail z-40 bg-rail text-rail-texto md:fixed md:inset-y-0 md:left-0 md:flex md:w-20 md:flex-col md:overflow-hidden md:transition-[width] md:duration-200 md:hover:w-64 md:hover:shadow-2xl md:focus-within:w-64 md:focus-within:shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-3 md:block md:px-0 md:py-6">
          <div className="md:flex md:flex-col md:items-center md:group-hover/rail:px-5 md:group-focus-within/rail:px-5">
            {/* El logo, sin texto: pequeño en el riel y mucho más grande al desplegarse */}
            <LogoMarca className="h-auto w-20 md:w-16 md:transition-[width] md:duration-200 md:group-hover/rail:w-44 md:group-focus-within/rail:w-44" titulo="FleetNautic" />
            <p className={`mt-1 hidden max-w-full truncate text-xs text-rail-texto/70 md:block md:h-4 ${etiqueta}`}>{tenantNombre}</p>
          </div>
          <button
            type="button" aria-expanded={abierto} aria-controls="menu-principal" aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setAbiertoEn(abierto ? null : pathname)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white hover:bg-white/10 md:hidden"
          >
            {abierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        <nav id="menu-principal" aria-label="Módulos" className={`${abierto ? "flex" : "hidden"} flex-col px-2 pb-2 md:flex md:flex-1 md:overflow-y-auto md:overflow-x-hidden md:px-3 md:pb-4`}>
          {grupos.map((grupo, gi) => (
            <div key={gi} style={{ flexGrow: grupo.length }} className={`flex flex-col gap-1 md:justify-evenly ${gi > 0 ? "mt-2 border-t border-white/10 pt-2 md:mt-3 md:pt-3" : ""}`}>
              {grupo.map((sec) => {
                const Icono = ICONOS[sec.id] ?? ClipboardList;
                const activo = sec.rutas.some((r) => pathname === r || pathname.startsWith(`${r}/`));
                return (
                  <Link key={sec.id} href={sec.href} title={sec.etiqueta} aria-label={sec.etiqueta} aria-current={activo ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium md:py-2 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-pato md:px-[18px] ${activo ? "bg-white/10 text-white" : ""}`}>
                    <Icono className={`h-5 w-5 shrink-0 ${activo ? "text-pato" : ""}`} />
                    <span className={etiqueta}>{sec.etiqueta}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      {compacto ? (
        // Calendario: pestañas y cuenta comparten una sola fila delgada para dejar toda la altura al mes
        <div className="flex items-center justify-between gap-3 px-2 pt-1.5 md:px-3">
          {seccion && seccion.tabs.length > 1 ? <PestanasSeccion tabs={seccion.tabs} pathname={pathname} compacta /> : <span />}
          <MenuCuenta pequeno nombre={usuarioNombre} foto={usuarioFoto} empresa={tenantNombre} configuracion={puedeConfigurar} salir={salir} />
        </div>
      ) : (
        <div className="flex justify-end px-4 pt-3 md:px-8">
          <MenuCuenta nombre={usuarioNombre} foto={usuarioFoto} empresa={tenantNombre} configuracion={puedeConfigurar} salir={salir} />
        </div>
      )}
      <main className={compacto ? "w-full min-w-0 px-2 py-1 md:px-3" : `mx-auto w-full min-w-0 px-4 py-6 md:px-8 ${ancho ? "max-w-none" : "max-w-6xl"}`}>
        {!compacto && seccion && seccion.tabs.length > 1 && <PestanasSeccion tabs={seccion.tabs} pathname={pathname} />}
        {children}
      </main>
    </div>
  );
}
