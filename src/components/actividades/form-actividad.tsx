import { Campo, Input, Textarea } from "../ui";

type Valores = { nombre?: string; descripcion?: string | null; duracionMin?: number; precioCentavos?: number; cupo?: number; color?: string; puntoEncuentro?: string | null; notas?: string | null };

export function CamposActividad({ v = {} }: { v?: Valores }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre" className="sm:col-span-2"><Input name="nombre" defaultValue={v.nombre} placeholder="Snorkel en catamarán" required /></Campo>
      <Campo etiqueta="Descripción" ayuda="Lo que incluye y lo que el cliente debe saber" className="sm:col-span-2"><Textarea name="descripcion" defaultValue={v.descripcion ?? ""} /></Campo>
      <Campo etiqueta="Duración (horas)"><Input name="horas" type="number" step="0.25" min="0.25" max="24" defaultValue={v.duracionMin ? v.duracionMin / 60 : 4} required /></Campo>
      <Campo etiqueta="Precio por persona"><Input name="precio" inputMode="decimal" defaultValue={v.precioCentavos != null ? String(v.precioCentavos / 100) : ""} placeholder="1200" required /></Campo>
      <Campo etiqueta="Cupo por salida" ayuda="Lugares disponibles en cada salida (se puede ajustar en cada una)"><Input name="cupo" type="number" min={1} max={500} defaultValue={v.cupo ?? 12} required /></Campo>
      <Campo etiqueta="Color en el calendario"><Input name="color" type="color" defaultValue={v.color ?? "#0ea5e9"} className="h-10 w-full rounded-lg border border-line bg-surface p-1" /></Campo>
      <Campo etiqueta="Punto de encuentro" className="sm:col-span-2"><Input name="puntoEncuentro" defaultValue={v.puntoEncuentro ?? ""} placeholder="Muelle 3, Marina Cabo" /></Campo>
      <Campo etiqueta="Notas internas" className="sm:col-span-2"><Textarea name="notas" defaultValue={v.notas ?? ""} /></Campo>
    </div>
  );
}
