"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Camera, LogOut, Settings, Trash2 } from "lucide-react";
import { confirmarFotoPerfilAccion, prepararFotoPerfilAccion, quitarFotoPerfilAccion } from "@/app/(app)/cuenta-actions";
import { BUCKET_FOTOS, esMimeFoto, validarFoto } from "@/lib/storage/reglas";
import { prepararArchivo } from "@/lib/storage/cliente";

const iniciales = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

/** Ícono de la cuenta, en la esquina superior derecha: abre un menú con la configuración y el cierre de sesión. */
export function MenuCuenta({ nombre, foto, empresa, configuracion, salir, pequeno }: { nombre: string; foto: string | null; empresa: string; configuracion: boolean; salir: () => Promise<void>; pequeno?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [pendiente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function subir(files: FileList | null) {
    const original = files?.[0];
    if (!original) return;
    setMsg(null);
    iniciar(async () => {
      const f = await prepararArchivo(original);
      const motivo = validarFoto({ mime: f.type, tamano: f.size });
      if (motivo || !esMimeFoto(f.type)) { setMsg(motivo ?? "Solo se aceptan fotos JPG, PNG o WebP."); return; }
      const p = await prepararFotoPerfilAccion({ mime: f.type, tamano: f.size });
      if ("error" in p) { setMsg(p.error); return; }
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await sb.storage.from(BUCKET_FOTOS).uploadToSignedUrl(p.ruta, p.token, f, { contentType: f.type });
      if (error) { setMsg("No se pudo subir la foto."); return; }
      const r = await confirmarFotoPerfilAccion(p.ruta);
      if (r.error) { setMsg(r.error); return; }
      if (archivo.current) archivo.current.value = "";
      router.refresh();
    });
  }

  function quitar() {
    iniciar(async () => { const r = await quitarFotoPerfilAccion(); setMsg(r.error ?? null); router.refresh(); });
  }

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand";
  return (
    <div ref={raiz} className="relative">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-haspopup="menu" aria-expanded={abierto} aria-label={`Cuenta de ${nombre}`} title={nombre}
        className={`flex ${pequeno ? "h-8 w-8" : "h-10 w-10"} items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-pato outline-none ring-offset-2 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand`}>
        {foto
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={foto} alt="" className="h-full w-full rounded-full object-cover" />
          : iniciales(nombre)}
      </button>
      {abierto && (
        <div role="menu" className={`absolute right-0 ${pequeno ? "top-10" : "top-12"} z-50 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl`}>
          <div className="border-b border-line px-3 pb-2 pt-1">
            <p className="truncate text-sm font-semibold">{nombre}</p>
            <p className="truncate text-xs text-muted">{empresa}</p>
          </div>
          <div className="pt-1">
            <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => subir(e.target.files)} />
            <button type="button" role="menuitem" onClick={() => archivo.current?.click()} disabled={pendiente} className={item}><Camera className="h-4 w-4 text-muted" />{pendiente ? "Subiendo…" : foto ? "Cambiar foto" : "Subir foto de perfil"}</button>
            {foto && <button type="button" role="menuitem" onClick={quitar} disabled={pendiente} className={item}><Trash2 className="h-4 w-4 text-muted" />Quitar foto</button>}
            {msg && <p role="alert" className="px-3 py-1 text-xs text-red-600">{msg}</p>}
            {configuracion && (
              <Link href="/configuracion" role="menuitem" onClick={() => setAbierto(false)} className={item}><Settings className="h-4 w-4 text-muted" />Configuración</Link>
            )}
            <form action={salir}>
              <button role="menuitem" className={item}><LogOut className="h-4 w-4 text-muted" />Cerrar sesión</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
