"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings } from "lucide-react";

const iniciales = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

/** Ícono de la cuenta, en la esquina superior derecha: abre un menú con la configuración y el cierre de sesión. */
export function MenuCuenta({ nombre, empresa, configuracion, salir }: { nombre: string; empresa: string; configuracion: boolean; salir: () => Promise<void> }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand";
  return (
    <div ref={raiz} className="relative">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-haspopup="menu" aria-expanded={abierto} aria-label={`Cuenta de ${nombre}`} title={nombre}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-semibold text-pato outline-none ring-offset-2 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand">
        {iniciales(nombre)}
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl">
          <div className="border-b border-line px-3 pb-2 pt-1">
            <p className="truncate text-sm font-semibold">{nombre}</p>
            <p className="truncate text-xs text-muted">{empresa}</p>
          </div>
          <div className="pt-1">
            {configuracion && (
              <Link href="/configuracion" role="menuitem" onClick={() => setAbierto(false)} className={item}><Settings className="h-4 w-4 text-muted" />Configuración</Link>
            )}
            <form action={salir}>
              <button role="menuitem" className={item}><LogOut className="h-4 w-4 text-muted" />Cerrar sesión</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
