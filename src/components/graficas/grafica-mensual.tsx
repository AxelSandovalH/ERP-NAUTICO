"use client";
import { useEffect, useRef, useState } from "react";
import { compacto, escalaDeEje } from "@/lib/reportes/agregar";

type Serie = { nombre: string; valores: number[]; variable: string };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const ANCHO_INICIAL = 720, H = 280, M = { l: 52, r: 8, t: 14, b: 30 };

/** Columnas por mes (una o varias series). Marcas finas con la punta redondeada, rejilla de líneas finas y tooltip por mes
 *  al pasar el cursor o enfocar con el teclado. La tabla es la vista equivalente de los mismos datos. */
export function GraficaMensual({ meses, series, moneda, titulo }: { meses: string[]; series: Serie[]; moneda: string; titulo: string }) {
  const [activo, setActivo] = useState<number | null>(null);
  // El dibujo se arma al ancho real de la tarjeta (1 px del dibujo = 1 px de pantalla): así el texto de los ejes no se encoge en el celular
  const caja = useRef<HTMLElement>(null);
  const [W, setW] = useState(ANCHO_INICIAL);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setW(Math.max(260, Math.round(el.clientWidth)));
    medir();
    const o = new ResizeObserver(medir);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const [tabla, setTabla] = useState(false);
  const dinero = (c: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda }).format(c / 100);
  const n = meses.length, k = series.length;
  // El año solo se muestra cuando el periodo cruza de un año a otro
  const variosAnios = new Set(meses.map((m) => m.slice(0, 4))).size > 1;
  const corto = (mes: string) => `${MESES[Number(mes.slice(5)) - 1]}${variosAnios ? ` ${mes.slice(2, 4)}` : ""}`;
  const { techo, paso } = escalaDeEje(Math.max(...series.flatMap((s) => s.valores), 0));
  const pw = W - M.l - M.r, ph = H - M.t - M.b, banda = pw / n;
  const grosor = Math.max(6, Math.min(24, (banda - 14) / k - 2));
  const y = (v: number) => M.t + ph * (1 - v / techo), base = M.t + ph;
  const ticks = Array.from({ length: Math.round(techo / paso) + 1 }, (_, i) => i * paso);

  const columna = (x: number, v: number) => {
    const alto = base - y(v);
    if (alto <= 0) return null;
    const r = Math.min(4, alto / 2, grosor / 2), top = y(v);
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + grosor - r}Q${x + grosor},${top} ${x + grosor},${top + r}V${base}Z`;
  };

  return (
    <figure aria-label={titulo} ref={caja}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {k > 1 ? (
          <ul className="flex flex-wrap gap-4 text-xs text-muted">
            {series.map((s) => <li key={s.nombre} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: `var(${s.variable})` }} />{s.nombre}</li>)}
          </ul>
        ) : <span />}
        <button type="button" onClick={() => setTabla((t) => !t)} className="rounded-lg border border-line px-2.5 py-1 text-xs hover:bg-brand-soft">{tabla ? "Ver gráfica" : "Ver tabla"}</button>
      </div>

      {tabla ? (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead><tr><th className="border-b border-line px-4 py-2 text-xs font-semibold uppercase text-muted">Mes</th>{series.map((s) => <th key={s.nombre} className="border-b border-line px-4 py-2 text-right text-xs font-semibold uppercase text-muted">{s.nombre}</th>)}</tr></thead>
            <tbody>{meses.map((m, i) => <tr key={m}><td className="px-4 py-2">{corto(m)}</td>{series.map((s) => <td key={s.nombre} className="px-4 py-2 text-right tabular-nums">{dinero(s.valores[i])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${titulo}: ${meses.map((m, i) => `${corto(m)} ${series.map((s) => `${s.nombre} ${dinero(s.valores[i])}`).join(", ")}`).join("; ")}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                <text x={M.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{compacto(t)}</text>
              </g>
            ))}
            {meses.map((m, i) => {
              const cx = M.l + banda * i + banda / 2, ancho = k * grosor + (k - 1) * 2;
              return (
                <g key={m}>
                  {activo === i && <rect x={M.l + banda * i + 2} y={M.t} width={banda - 4} height={ph} fill="var(--brand-soft)" opacity={0.6} />}
                  {series.map((s, j) => {
                    const d = columna(cx - ancho / 2 + j * (grosor + 2), s.valores[i]);
                    return d ? <path key={s.nombre} d={d} fill={`var(${s.variable})`} /> : null;
                  })}
                  <text x={cx} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--muted)">{corto(m)}</text>
                  <rect
                    x={M.l + banda * i} y={M.t} width={banda} height={ph + M.b} fill="transparent" tabIndex={0}
                    aria-label={`${corto(m)}: ${series.map((s) => `${s.nombre} ${dinero(s.valores[i])}`).join(", ")}`}
                    onPointerEnter={() => setActivo(i)} onPointerMove={() => setActivo(i)} onPointerLeave={() => setActivo(null)}
                    onFocus={() => setActivo(i)} onBlur={() => setActivo(null)} className="outline-none"
                  />
                </g>
              );
            })}
            <line x1={M.l} x2={W - M.r} y1={base} y2={base} stroke="var(--line)" strokeWidth={1} />
          </svg>
          {activo !== null && (
            <div role="tooltip" className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
              // Se coloca al lado de la columna (no encima) para no tapar las marcas que se están leyendo
              style={activo >= n / 2
                ? { left: `${((M.l + banda * activo) / W) * 100}%`, transform: "translateX(calc(-100% - 8px))" }
                : { left: `${((M.l + banda * (activo + 1)) / W) * 100}%`, transform: "translateX(8px)" }}>
              <p className="mb-1 text-muted">{corto(meses[activo])}</p>
              {series.map((s) => (
                <p key={s.nombre} className="flex items-center gap-2">
                  <span className="inline-block h-0.5 w-3" style={{ background: `var(${s.variable})` }} />
                  <strong className="text-sm">{dinero(s.valores[activo])}</strong>
                  <span className="text-muted">{s.nombre}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
