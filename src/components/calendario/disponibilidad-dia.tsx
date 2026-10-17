"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";
import type { BarcoDisponibilidad } from "@/app/api/calendario/disponibilidad/route";
import { fechaLarga } from "@/lib/fechas";
import { describirVentana, emojiVentana, hhmmAMin, ventanasLibres, type Ventana } from "@/lib/calendario/ventanas-disponibilidad";

// Disponibilidad del día lista para mandar por WhatsApp a agencias y clientes.
// Sobre el tiempo no ocupado por reservas/bloqueos se buscan las ventanas donde
// cabe un tour completo, dejando un margen de preparación entre tours. El margen
// es una sugerencia editable y cada ventana se puede apagar antes de copiar.

const DURACION_DEFAULT_MIN = 180;
const claveVentana = (v: Ventana) => `${v.ini}-${v.fin}`;
const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function DisponibilidadDia({ fechaInicial, onClose }: { fechaInicial?: string; onClose: () => void }) {
  const [fecha, setFecha] = useState(fechaInicial ?? hoyLocal());
  // Se guarda con su fecha: "cargando" se deriva (fecha pedida ≠ cargada)
  const [datos, setDatos] = useState<{ fecha: string; barcos: BarcoDisponibilidad[] } | null>(null);
  const [error, setError] = useState(false);
  const [margen, setMargen] = useState("30");
  const [diaIni, setDiaIni] = useState("09:00");
  const [diaFin, setDiaFin] = useState("20:00");
  const [ocultas, setOcultas] = useState<Record<string, Set<string>>>({});
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/calendario/disponibilidad?fecha=${fecha}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { fecha: string; barcos: BarcoDisponibilidad[] }) => { if (vivo) { setDatos(d); setError(false); } })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [fecha]);

  const barcos = datos?.fecha === fecha ? datos.barcos : null;
  const params = { margenMin: Math.max(0, Number(margen) || 0), diaIni: hhmmAMin(diaIni || "09:00"), diaFin: hhmmAMin(diaFin || "20:00") };

  const ventanasPorBarco = useMemo(() => {
    const m = new Map<string, Ventana[]>();
    for (const b of barcos ?? []) {
      m.set(b.id, b.bloqueadoTodoElDia ? [] : ventanasLibres(b.ocupado, { ...params, duracionMin: b.duracionBaseMin ?? DURACION_DEFAULT_MIN }));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcos, params.margenMin, params.diaIni, params.diaFin]);

  const alternar = (b: BarcoDisponibilidad, v: Ventana) =>
    setOcultas((prev) => {
      const s = new Set(prev[b.id] ?? []);
      const k = claveVentana(v);
      if (s.has(k)) s.delete(k); else s.add(k);
      return { ...prev, [b.id]: s };
    });

  const texto = useMemo(() => {
    if (!barcos) return ""; // mientras carga no se afirma nada
    const lineas = [`*Disponibilidad — ${fechaLarga(fecha)}*`, ""];
    let alguno = false;
    for (const b of barcos ?? []) {
      const vs = (ventanasPorBarco.get(b.id) ?? []).filter((v) => !ocultas[b.id]?.has(claveVentana(v)));
      if (vs.length === 0) continue;
      alguno = true;
      lineas.push(`*${b.nombre}* (hasta ${b.capacidad} pax)`);
      for (const v of vs) lineas.push(`${emojiVentana(v)} ${describirVentana(v)}`);
      lineas.push("");
    }
    if (!alguno) lineas.push("Sin disponibilidad para este día.");
    return lineas.join("\n").trim();
  }, [barcos, ventanasPorBarco, ocultas, fecha]);

  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin permiso de portapapeles */ }
  }

  const campo = "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/40";
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label="Disponibilidad del día" className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">Disponibilidad del día</h2>
          <button onClick={onClose} aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-line px-5 py-3 sm:grid-cols-4">
          <label className="text-xs">Fecha<input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} className={campo} /></label>
          <label className="text-xs">Margen entre tours (min)<input type="number" min={0} step={5} value={margen} onChange={(e) => setMargen(e.target.value)} className={campo} /></label>
          <label className="text-xs">Primera salida<input type="time" value={diaIni} onChange={(e) => setDiaIni(e.target.value)} className={campo} /></label>
          <label className="text-xs">Regreso máximo<input type="time" value={diaFin} onChange={(e) => setDiaFin(e.target.value)} className={campo} /></label>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-600">No se pudo cargar la disponibilidad.</p>}
          {!barcos && !error && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>}
          {barcos?.length === 0 && <p className="text-sm text-muted">No hay embarcaciones activas.</p>}
          {barcos?.map((b) => {
            const todas = ventanasPorBarco.get(b.id) ?? [];
            return (
              <div key={b.id}>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                  {b.nombre}<span className="font-normal text-muted">· {b.capacidad} pax · tour de {(b.duracionBaseMin ?? DURACION_DEFAULT_MIN) / 60} h</span>
                </p>
                {b.bloqueadoTodoElDia ? <p className="ml-4 mt-1 text-xs text-muted">Bloqueada todo el día.</p>
                  : todas.length === 0 ? <p className="ml-4 mt-1 text-xs text-muted">Sin hueco para un tour completo.</p>
                  : (
                    <ul className="ml-4 mt-1 space-y-1">
                      {todas.map((v) => (
                        <li key={claveVentana(v)}>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={!ocultas[b.id]?.has(claveVentana(v))} onChange={() => alternar(b, v)} />
                            <span>{emojiVentana(v)} {describirVentana(v)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                {b.ocupado.filter((o) => o.tipo === "RESERVA").length > 0 && (
                  <p className="ml-4 mt-1 text-[11px] text-muted">Ocupada: {b.ocupado.filter((o) => o.tipo === "RESERVA").map((o) => o.label).join(" · ")}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-line px-5 py-3">
          <textarea readOnly value={texto} rows={5} className="w-full resize-none rounded-lg border border-line bg-background p-2.5 font-mono text-xs" />
          <button onClick={copiar} className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-fg hover:opacity-90">
            {copiado ? <><Check className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar para WhatsApp</>}
          </button>
        </div>
      </div>
    </div>
  );
}
