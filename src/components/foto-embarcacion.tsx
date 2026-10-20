"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Camera, ImageIcon, Trash2 } from "lucide-react";
import { BUCKET_FOTOS, esMimeFoto, validarFoto } from "@/lib/storage/reglas";
import { prepararArchivo } from "@/lib/storage/cliente";
import { FotoAjustada } from "./foto-ajustada";

type Acciones = {
  preparar: (id: string, a: { mime: string; tamano: number }) => Promise<{ error: string } | { ruta: string; token: string }>;
  confirmar: (id: string, ruta: string) => Promise<{ error?: string; ok?: true }>;
  quitar: (id: string) => Promise<{ error?: string; ok?: true }>;
};

/** Foto principal de una embarcación o unidad: se reduce en el navegador y se sube directo a Storage. */
export function FotoEmbarcacion({ embarcacionId, url, puedeEditar, acciones, compacta }: { embarcacionId: string; url: string | null; puedeEditar: boolean; acciones: Acciones; compacta?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pendiente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function subir(files: FileList | null) {
    const original = files?.[0];
    if (!original) return;
    setMsg(null);
    iniciar(async () => {
      const archivo = await prepararArchivo(original);
      const motivo = validarFoto({ mime: archivo.type, tamano: archivo.size });
      if (motivo || !esMimeFoto(archivo.type)) { setMsg(motivo ?? "Solo se aceptan fotos JPG, PNG o WebP."); return; }
      const p = await acciones.preparar(embarcacionId, { mime: archivo.type, tamano: archivo.size });
      if ("error" in p) { setMsg(p.error); return; }
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await sb.storage.from(BUCKET_FOTOS).uploadToSignedUrl(p.ruta, p.token, archivo, { contentType: archivo.type });
      if (error) { setMsg("No se pudo subir la foto."); return; }
      const r = await acciones.confirmar(embarcacionId, p.ruta);
      if (r.error) { setMsg(r.error); return; }
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  function quitar() {
    if (!window.confirm("¿Quitar la foto de esta embarcación?")) return;
    iniciar(async () => { const r = await acciones.quitar(embarcacionId); setMsg(r.error ?? null); router.refresh(); });
  }

  return (
    <div>
      {url
        ? <FotoAjustada src={url} alt="Foto de la embarcación" className={`aspect-[16/10] rounded-lg border border-line ${compacta ? "max-w-xs" : ""}`} />
        : <div className={`flex aspect-[16/10] flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface text-muted ${compacta ? "max-w-xs" : ""}`}><ImageIcon className="h-8 w-8" /><span className="text-sm">Sin foto</span></div>}
      {puedeEditar && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => subir(e.target.files)} />
          <button type="button" onClick={() => input.current?.click()} disabled={pendiente}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-brand-soft disabled:opacity-50">
            <Camera className="h-4 w-4" /> {pendiente ? "Subiendo…" : url ? "Cambiar foto" : "Subir foto"}
          </button>
          {url && <button type="button" onClick={quitar} disabled={pendiente} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" />Quitar</button>}
        </div>
      )}
      {msg && <p role="alert" className="mt-2 text-sm text-red-600">{msg}</p>}
      {puedeEditar && <p className="mt-1 text-xs text-muted">JPG, PNG o WebP · hasta 5 MB. La foto se reduce automáticamente.</p>}
    </div>
  );
}
