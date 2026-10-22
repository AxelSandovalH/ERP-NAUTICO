import { Campo, Input, Select, Textarea } from "../ui";

type Valores = { actividadId?: string; fecha?: string; hora?: string; cupo?: number; precioCentavos?: number; embarcacionId?: string | null; guiaId?: string | null; notas?: string | null };

/** `actividades` solo se pasa al programar (al editar, la actividad no cambia). */
export function CamposSalida({ actividades, embarcaciones, guias, v = {} }: {
  actividades?: { id: string; nombre: string }[]; embarcaciones: { id: string; nombre: string; capacidad: number }[]; guias: { id: string; nombre: string }[]; v?: Valores;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {actividades && (
        <Campo etiqueta="Actividad" className="sm:col-span-2">
          <Select name="actividadId" defaultValue={v.actividadId ?? ""} required>
            <option value="" disabled>Elige una actividad</option>
            {actividades.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </Select>
        </Campo>
      )}
      <Campo etiqueta="Fecha"><Input name="fecha" type="date" defaultValue={v.fecha} required /></Campo>
      <Campo etiqueta="Hora de salida"><Input name="hora" type="time" defaultValue={v.hora ?? "09:00"} required /></Campo>
      <Campo etiqueta="Cupo" ayuda="Vacío = el de la actividad"><Input name="cupo" type="number" min={1} max={500} defaultValue={v.cupo ?? ""} /></Campo>
      <Campo etiqueta="Precio por persona" ayuda="Vacío = el de la actividad"><Input name="precio" inputMode="decimal" defaultValue={v.precioCentavos != null ? String(v.precioCentavos / 100) : ""} /></Campo>
      <Campo etiqueta="Embarcación" ayuda="Si la usa, queda ocupada en el calendario">
        <Select name="embarcacionId" defaultValue={v.embarcacionId ?? ""}>
          <option value="">Sin embarcación</option>
          {embarcaciones.map((e) => <option key={e.id} value={e.id}>{e.nombre} (hasta {e.capacidad})</option>)}
        </Select>
      </Campo>
      <Campo etiqueta="Guía">
        <Select name="guiaId" defaultValue={v.guiaId ?? ""}>
          <option value="">Sin asignar</option>
          {guias.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </Select>
      </Campo>
      <Campo etiqueta="Notas" className="sm:col-span-2"><Textarea name="notas" defaultValue={v.notas ?? ""} /></Campo>
    </div>
  );
}
