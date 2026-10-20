/** Foto completa dentro de su marco, sin recortes: se ve entera y el sobrante se rellena con la misma foto desenfocada.
 *  El marco (tamaño y bordes) lo define `className`. */
export function FotoAjustada({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-slate-200 dark:bg-slate-800 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full scale-125 object-cover blur-2xl" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="relative h-full w-full object-contain" />
    </div>
  );
}
