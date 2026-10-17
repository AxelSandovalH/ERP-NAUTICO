"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ImageIcon, Paperclip, Trash2 } from "lucide-react";
import { eliminarComprobanteAccion, urlComprobanteAccion } from "@/app/(app)/gastos/comprobantes-actions";
import { prepararArchivo, subirComprobante } from "@/lib/storage/cliente";

type Item = { id: string; nombre: string; mime: string; tamano: number };
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Lista, abre, sube y elimina los comprobantes de un gasto. */
export function ComprobantesGasto({ gastoId, items, puedeSubir, puedeEliminarTodos, usuarioId, subidos }: {
  gastoId: string; items: Item[]; puedeSubir: boolean; puedeEliminarTodos: boolean; usuarioId: string; subidos: Record<string, string | null>;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pendiente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function abrir(id: string) {
    setMsg(null);
    const r = await urlComprobanteAccion(id);
    if ("error" in r) setMsg(r.error); else window.open(r.url, "_blank", "noopener,noreferrer");
  }

  function subir(files: FileList | null) {
    if (!files || files.length === 0) return;
    setMsg(null);
    iniciar(async () => {
      const errores: string[] = [];
      for (const original of Array.from(files)) {
        const r = await subirComprobante(gastoId, await prepararArchivo(original));
        if (r.error) errores.push(`${original.name}: ${r.error}`);
      }
      if (input.current) input.current.value = "";
      setMsg(errores.length ? errores.join(" · ") : null);
      router.refresh();
    });
  }

  function quitar(id: string) {
    if (!window.confirm("¿Eliminar este comprobante?")) return;
    iniciar(async () => { const r = await eliminarComprobanteAccion(id); setMsg(r.error ?? null); router.refresh(); });
  }

  return (
    <div>
      {items.length === 0 ? <p className="text-sm text-muted">Sin comprobantes.</p> : (
        <ul className="divide-y divide-line text-sm">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <button onClick={() => abrir(c.id)} className="flex min-w-0 items-center gap-2 text-left hover:text-brand">
                {c.mime === "application/pdf" ? <FileText className="h-4 w-4 shrink-0" /> : <ImageIcon className="h-4 w-4 shrink-0" />}
                <span className="truncate">{c.nombre}</span><span className="shrink-0 text-xs text-muted">{kb(c.tamano)}</span>
              </button>
              {(puedeEliminarTodos || subidos[c.id] === usuarioId) && (
                <button onClick={() => quitar(c.id)} disabled={pendiente} aria-label="Eliminar comprobante" className="text-muted hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeSubir && (
        <div className="mt-3">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
          <button onClick={() => input.current?.click()} disabled={pendiente}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-brand-soft disabled:opacity-50">
            <Paperclip className="h-4 w-4" /> {pendiente ? "Subiendo…" : "Agregar foto o PDF"}
          </button>
          <p className="mt-1 text-xs text-muted">JPG, PNG, WebP o PDF · hasta 10 MB · máximo 8 por gasto. Las fotos se reducen automáticamente.</p>
        </div>
      )}
      {msg && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{msg}</p>}
    </div>
  );
}
