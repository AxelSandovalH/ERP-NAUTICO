"use client";
import { useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Campo, Input } from "./ui";

/** Campos de una geocerca, con un botón para llenar latitud y longitud con tu ubicación actual. */
export function CamposUbicacion() {
  const lat = useRef<HTMLInputElement>(null), lng = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState("");
  function usarMiUbicacion() {
    if (!navigator.geolocation) return setEstado("Tu navegador no permite obtener la ubicación.");
    setEstado("Buscando…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (lat.current) lat.current.value = p.coords.latitude.toFixed(6);
        if (lng.current) lng.current.value = p.coords.longitude.toFixed(6);
        setEstado(`Listo (precisión ±${Math.round(p.coords.accuracy)} m).`);
      },
      () => setEstado("No se pudo obtener tu ubicación."),
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo etiqueta="Nombre" className="sm:col-span-2"><Input name="nombre" placeholder="Marina, Oficina…" required /></Campo>
      <Campo etiqueta="Latitud"><Input ref={lat} name="lat" inputMode="decimal" required /></Campo>
      <Campo etiqueta="Longitud"><Input ref={lng} name="lng" inputMode="decimal" required /></Campo>
      <Campo etiqueta="Radio (metros)" ayuda="Qué tan lejos del punto se acepta una checada"><Input name="radioMetros" type="number" min={20} max={2000} defaultValue={150} required /></Campo>
      <div className="flex flex-col justify-end gap-1">
        <button type="button" onClick={usarMiUbicacion} className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-brand-soft">
          <MapPin className="h-4 w-4" /> Usar mi ubicación actual
        </button>
        {estado && <span className="text-xs text-muted">{estado}</span>}
      </div>
    </div>
  );
}
