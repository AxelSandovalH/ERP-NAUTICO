import { Campo, Input, Select, Textarea } from "./ui";
import { ESTADOS_EMBARCACION, TIPOS_EMBARCACION } from "@/lib/etiquetas";

type Valores = {
  nombre?: string; tipo?: string; capacidad?: number; esloraPies?: number | null;
  color?: string; estado?: string; notas?: string | null;
};

export function CamposEmbarcacion({ v = {}, conEstado = false }: { v?: Valores; conEstado?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre"><Input name="nombre" defaultValue={v.nombre} required /></Campo>
      <Campo etiqueta="Tipo">
        <Select name="tipo" defaultValue={v.tipo ?? "YATE"}>
          {Object.entries(TIPOS_EMBARCACION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Campo>
      <Campo etiqueta="Capacidad (pasajeros)"><Input name="capacidad" type="number" min={1} defaultValue={v.capacidad ?? 10} required /></Campo>
      <Campo etiqueta="Eslora (pies)"><Input name="esloraPies" type="number" min={1} defaultValue={v.esloraPies ?? ""} /></Campo>
      <Campo etiqueta="Color en calendario"><Input name="color" type="color" defaultValue={v.color ?? "#0ea5e9"} className="h-10 w-full rounded-lg border border-line bg-surface p-1" /></Campo>
      {conEstado && (
        <Campo etiqueta="Estado">
          <Select name="estado" defaultValue={v.estado ?? "ACTIVA"}>
            {Object.entries(ESTADOS_EMBARCACION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Campo>
      )}
      <Campo etiqueta="Notas" className="sm:col-span-2"><Textarea name="notas" defaultValue={v.notas ?? ""} /></Campo>
    </div>
  );
}
