import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card } from "../ui";

/** Una cifra con su variación contra el periodo anterior. El color de la variación depende de si subir es bueno,
 *  y va siempre con flecha y signo (el color solo no basta). */
export function Tile({ etiqueta, valor, variacion, subeEsBueno = true, nota }: { etiqueta: string; valor: string; variacion?: number | null; subeEsBueno?: boolean; nota?: string }) {
  const hay = variacion !== undefined;
  const bueno = variacion ? (variacion > 0) === subeEsBueno : false;
  return (
    <Card>
      <p className="text-sm text-muted">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
      {hay && (
        <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: variacion ? (bueno ? "var(--bueno)" : "var(--malo)") : "var(--muted)" }}>
          {variacion === null ? <><Minus className="h-3.5 w-3.5" aria-hidden /> Sin periodo anterior para comparar</>
            : variacion === 0 ? <><Minus className="h-3.5 w-3.5" aria-hidden /> Igual que el periodo anterior</>
            : <>{variacion > 0 ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden />}
                {variacion > 0 ? "+" : "−"}{Math.abs(variacion).toLocaleString("es-MX", { maximumFractionDigits: 1 })}% vs periodo anterior</>}
        </p>
      )}
      {nota && <p className="mt-1 text-xs text-muted">{nota}</p>}
    </Card>
  );
}
