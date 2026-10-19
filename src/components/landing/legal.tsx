import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { LogoMarca } from "@/components/logo";
import { CONTACTO } from "./contacto";

const SOBRE_NAVY = { "--logo-bote": "#ffffff" } as CSSProperties;

/** Marco común de las páginas legales públicas. */
export function PaginaLegal({ titulo, actualizado, children }: { titulo: string; actualizado: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 bg-navy" style={SOBRE_NAVY}>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" aria-label="FleetNautic, inicio"><LogoMarca className="h-auto w-24" titulo="FleetNautic" /></Link>
          <Link href="/" className="text-sm text-slate-300 hover:text-white">Volver al inicio</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">{titulo}</h1>
        <p className="mt-1 text-sm text-muted">Última actualización: {actualizado}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed [&_h2]:mb-2 [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:text-brand [&_a]:underline">
          {children}
        </div>
        <p className="mt-10 border-t border-line pt-4 text-sm text-muted">
          Contacto: <a className="text-brand underline" href={`mailto:${CONTACTO.email}`}>{CONTACTO.email}</a> · <a className="text-brand underline" href={CONTACTO.tel}>{CONTACTO.telefonoVisible}</a> (llamadas y WhatsApp)
        </p>
      </main>
    </div>
  );
}
