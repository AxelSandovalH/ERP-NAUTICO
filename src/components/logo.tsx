import { LOGO_BOTE, LOGO_OLA, LOGO_VIEWBOX } from "./logo-paths";

/** Marca (bote + ola). Los colores salen de variables CSS: el bote es azul marino de
 *  marca en tema claro y se aclara en el oscuro para no perderse sobre el fondo. */
export function LogoMarca({ className = "h-8 w-auto", titulo }: { className?: string; titulo?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} className={className} role={titulo ? "img" : undefined} aria-label={titulo} aria-hidden={titulo ? undefined : true}>
      <path fill="var(--logo-bote)" fillRule="evenodd" d={LOGO_BOTE} />
      <path fill="var(--logo-ola)" fillRule="evenodd" d={LOGO_OLA} />
    </svg>
  );
}

/** Marca + nombre del producto. */
export function Logo({ className = "h-8", conTexto = true }: { className?: string; conTexto?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMarca className={`${className} w-auto shrink-0`} titulo={conTexto ? undefined : "FleetNautic"} />
      {conTexto && <span className="text-lg font-semibold tracking-tight">FleetNautic</span>}
    </span>
  );
}
