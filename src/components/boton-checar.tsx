"use client";
import { useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { checarAccion } from "@/app/(app)/asistencia/actions";

/** Pide la ubicación del celular y registra la checada. Requiere HTTPS (o localhost) y permiso de GPS. */
export function BotonChecar({ etiqueta }: { etiqueta: string }) {
  const [pendiente, iniciar] = useTransition();
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  function checar() {
    setMsg(null);
    if (!navigator.geolocation) return setMsg({ tipo: "error", texto: "Tu navegador no permite obtener la ubicación." });
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscando(false);
        iniciar(async () => {
          const r = await checarAccion({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisionM: pos.coords.accuracy ?? null });
          setMsg(r?.error ? { tipo: "error", texto: r.error } : { tipo: "ok", texto: r?.ok ?? "Listo." });
        });
      },
      (err) => {
        setBuscando(false);
        setMsg({ tipo: "error", texto: err.code === err.PERMISSION_DENIED ? "Necesitas permitir el acceso a tu ubicación para checar." : "No se pudo obtener tu ubicación. Inténtalo de nuevo." });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  const ocupado = buscando || pendiente;
  return (
    <div>
      <button onClick={checar} disabled={ocupado}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-4 text-lg font-semibold text-brand-fg transition hover:opacity-90 disabled:opacity-60">
        <MapPin className="h-5 w-5" /> {buscando ? "Buscando tu ubicación…" : pendiente ? "Registrando…" : etiqueta}
      </button>
      {msg && (
        <p role="alert" className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200"}`}>{msg.texto}</p>
      )}
    </div>
  );
}
