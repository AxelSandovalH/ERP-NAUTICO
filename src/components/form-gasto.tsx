"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Sparkles, X } from "lucide-react";
import { Campo, Input, Select, Textarea, Boton } from "./ui";
import { registrarGastoAccion } from "@/app/(app)/gastos/actions";
import { extraerTicketAccion } from "@/app/(app)/gastos/comprobantes-actions";
import { prepararArchivo, subirComprobante } from "@/lib/storage/cliente";

type Cuenta = { id: string; nombre: string; moneda: "MXN" | "USD" };
type Opcion = { id: string; nombre: string };

/** Alta de gasto con fotos del ticket. "Leer ticket con IA" prellena el formulario; la persona revisa y guarda. */
export function FormGasto({ cuentas, categorias, embarcaciones, base, tipoCambio, hoy, iaDisponible }: {
  cuentas: Cuenta[]; categorias: Opcion[]; embarcaciones: Opcion[]; base: "MXN" | "USD"; tipoCambio: number; hoy: string; iaDisponible: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [v, setV] = useState({ concepto: "", monto: "", fecha: hoy, cuentaId: cuentas[0]?.id ?? "", categoriaId: "", embarcacionId: "", reservaFolio: "", proveedor: "", notas: "", tipoCambio: String(tipoCambio), requiereFactura: false });
  const [archivos, setArchivos] = useState<File[]>([]);
  const [estado, setEstado] = useState<"idle" | "leyendo" | "guardando">("idle");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));

  const cuenta = cuentas.find((c) => c.id === v.cuentaId);
  const otraMoneda = !!cuenta && cuenta.moneda !== base;
  const n = Number(v.monto.replace(/[, $]/g, "")), t = Number(v.tipoCambio);
  const equivalente = otraMoneda && n > 0 && t > 0 ? (cuenta!.moneda === "USD" ? n * t : n / t).toLocaleString("es-MX", { style: "currency", currency: base }) : null;

  async function agregar(files: FileList | null) {
    if (!files) return;
    const listos = await Promise.all(Array.from(files).map(prepararArchivo));
    setArchivos((a) => [...a, ...listos].slice(0, 8));
    if (input.current) input.current.value = "";
  }

  async function leerConIA() {
    const f = archivos[0];
    if (!f) return;
    setError(null); setAviso(null); setEstado("leyendo");
    const fd = new FormData(); fd.set("archivo", f);
    const r = await extraerTicketAccion(fd);
    setEstado("idle");
    if ("error" in r) return setError(r.error);
    const t = r.ticket;
    setV((x) => {
      const cat = categorias.find((c) => c.nombre === t.categoria);
      // Si el ticket está en dólares y la cuenta elegida es en pesos (o al revés), se propone una cuenta de esa moneda
      const cuentaId = t.moneda && cuentas.find((c) => c.id === x.cuentaId)?.moneda !== t.moneda ? cuentas.find((c) => c.moneda === t.moneda)?.id ?? x.cuentaId : x.cuentaId;
      return { ...x, concepto: t.concepto || x.concepto, proveedor: t.proveedor ?? x.proveedor, monto: t.monto ?? x.monto, fecha: t.fecha ?? x.fecha, categoriaId: cat?.id ?? x.categoriaId, cuentaId };
    });
    setAviso("Revisa los datos: la lectura es una sugerencia y puede equivocarse (sobre todo en el monto).");
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setAviso(null); setEstado("guardando");
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) if (k !== "requiereFactura" && !(k === "tipoCambio" && !otraMoneda)) fd.set(k, String(val));
    if (v.requiereFactura) fd.set("requiereFactura", "on");
    fd.set("sinRedirect", "1");
    const r = await registrarGastoAccion(undefined, fd);
    if (r?.error || !r?.id) { setEstado("idle"); return setError(r?.error ?? "No se pudo guardar el gasto."); }
    const fallos: string[] = [];
    for (const f of archivos) { const s = await subirComprobante(r.id, f); if (s.error) fallos.push(`${f.name}: ${s.error}`); }
    // El gasto ya existe: si algún archivo falló se puede reintentar desde su detalle
    router.push(`/gastos/${r.id}${fallos.length ? "?aviso=comprobantes" : ""}`);
  }

  const ocupado = estado !== "idle";
  return (
    <form onSubmit={guardar} className="space-y-4">
      <div className="rounded-xl border border-dashed border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" multiple className="hidden" onChange={(e) => agregar(e.target.files)} />
          <button type="button" onClick={() => input.current?.click()} disabled={ocupado || archivos.length >= 8} className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-brand-soft disabled:opacity-50">
            <Paperclip className="h-4 w-4" /> Foto o PDF del ticket
          </button>
          {iaDisponible && archivos.length > 0 && (
            <button type="button" onClick={leerConIA} disabled={ocupado} className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50">
              <Sparkles className="h-4 w-4" /> {estado === "leyendo" ? "Leyendo…" : "Leer ticket con IA"}
            </button>
          )}
        </div>
        {archivos.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {archivos.map((f, i) => (
              <li key={`${f.name}${i}`} className="flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs">
                {f.name.length > 28 ? `${f.name.slice(0, 25)}…` : f.name}
                <button type="button" aria-label="Quitar" onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Se guardan como comprobantes del gasto.{iaDisponible ? " La IA lee la primera foto y llena el formulario por ti; siempre puedes corregirlo." : ""}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Concepto" className="sm:col-span-2"><Input value={v.concepto} onChange={(e) => set("concepto", e.target.value)} placeholder="Gasolina Sunseeker 80" required /></Campo>
        <Campo etiqueta={`Monto${cuenta ? ` (${cuenta.moneda})` : ""}`}><Input inputMode="decimal" value={v.monto} onChange={(e) => set("monto", e.target.value)} required /></Campo>
        <Campo etiqueta="Fecha"><Input type="date" value={v.fecha} onChange={(e) => set("fecha", e.target.value)} required /></Campo>
        <Campo etiqueta="Pagado con (cuenta)">
          <Select value={v.cuentaId} onChange={(e) => set("cuentaId", e.target.value)} required>{cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}</Select>
        </Campo>
        <Campo etiqueta="Categoría"><Select value={v.categoriaId} onChange={(e) => set("categoriaId", e.target.value)}><option value="">— Sin categoría —</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Campo>
        {otraMoneda && (
          <Campo etiqueta="Tipo de cambio (pesos por dólar)" ayuda={equivalente ? `Equivale a ${equivalente}` : "Se usa para sumar todo en la moneda base"}>
            <Input inputMode="decimal" value={v.tipoCambio} onChange={(e) => set("tipoCambio", e.target.value)} required />
          </Campo>
        )}
        <Campo etiqueta="Embarcación"><Select value={v.embarcacionId} onChange={(e) => set("embarcacionId", e.target.value)}><option value="">— General —</option>{embarcaciones.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select></Campo>
        <Campo etiqueta="Reserva (folio)" ayuda="Opcional"><Input inputMode="numeric" value={v.reservaFolio} onChange={(e) => set("reservaFolio", e.target.value)} placeholder="12" /></Campo>
        <Campo etiqueta="Proveedor"><Input value={v.proveedor} onChange={(e) => set("proveedor", e.target.value)} /></Campo>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.requiereFactura} onChange={(e) => set("requiereFactura", e.target.checked)} /> Hay que pedir factura de este gasto</label>
      <Campo etiqueta="Notas"><Textarea value={v.notas} onChange={(e) => set("notas", e.target.value)} /></Campo>

      {aviso && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{aviso}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      <Boton type="submit" disabled={ocupado}>{estado === "guardando" ? (archivos.length ? "Guardando y subiendo fotos…" : "Guardando…") : "Registrar gasto"}</Boton>
    </form>
  );
}
