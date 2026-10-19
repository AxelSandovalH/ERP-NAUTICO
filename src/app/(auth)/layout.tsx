import type { CSSProperties } from "react";
import { LogoMarca } from "@/components/logo";

// Sobre el fondo navy el bote del logo pasa a blanco (la ola ya es azul pato)
const SOBRE_NAVY = { "--logo-bote": "#ffffff" } as CSSProperties;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-navy bg-[radial-gradient(60%_50%_at_50%_0%,rgba(0,183,189,0.22),transparent)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center" style={SOBRE_NAVY}>
          <LogoMarca className="mx-auto h-auto w-44" titulo="FleetNautic" />
          <p className="mt-3 text-sm tracking-wide text-slate-300">La operación de tu flota, en orden</p>
        </div>
        {children}
      </div>
    </main>
  );
}
