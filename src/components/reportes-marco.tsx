import Link from "next/link";
import type { ReactNode } from "react";
import { RANGOS, type Periodo, type RangoId } from "@/lib/reportes/rangos";
import { BotonLink, PageHeader } from "@/components/ui";

/** Encabezado común de los reportes: título con el periodo y los botones de rango (cada reporte vive en su ruta). */
export function ReportesMarco({ titulo, base, id, periodo, csv, children }: { titulo: string; base: string; id: RangoId; periodo: Periodo; csv?: boolean; children: ReactNode }) {
  return (
    <>
      <PageHeader titulo={titulo} sub={`${periodo.etiqueta} · ${periodo.desde} a ${periodo.hasta}`} acciones={csv ? <BotonLink href={`/reportes/exportar?rango=${id}`} variante="suave">Descargar CSV</BotonLink> : undefined} />
      <nav aria-label="Periodo" className="mb-6 flex flex-wrap gap-2 text-sm">
        {(Object.keys(RANGOS) as RangoId[]).map((k) => (
          <Link key={k} href={`${base}?rango=${k}`} aria-current={k === id ? "true" : undefined} className={`rounded-full border px-3 py-1 ${k === id ? "border-brand bg-brand-soft font-medium" : "border-line hover:bg-brand-soft/50"}`}>{RANGOS[k]}</Link>
        ))}
      </nav>
      <div className="space-y-6">{children}</div>
    </>
  );
}
