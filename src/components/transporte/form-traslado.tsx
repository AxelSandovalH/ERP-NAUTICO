import { Campo, Input, Select, Textarea } from "../ui";
import { TIPOS_TRASLADO } from "@/lib/transporte/horario";

export type ValoresTraslado = { tipo?: string; fecha?: string; hora?: string; duracion?: number; origen?: string; destino?: string; pax?: number; unidadId?: string | null; choferId?: string | null; precio?: string; notas?: string | null };

/** Campos del traslado (alta y edición). La reserva se elige solo al crear; al editar va fija. */
export function CamposTraslado({ v = {}, reservaId, reservas, unidades, choferes }: {
  v?: ValoresTraslado; reservaId?: string;
  reservas?: { id: string; etiqueta: string }[];
  unidades: { id: string; nombre: string; capacidad: number }[]; choferes: { id: string; nombre: string }[];
}) {
  return (
    <div className="space-y-4">
      {reservas ? (
        <Campo etiqueta="Reserva"><Select name="reservaId" defaultValue={reservaId ?? ""} required><option value="" disabled>Elige la reserva…</option>{reservas.map((r) => <option key={r.id} value={r.id}>{r.etiqueta}</option>)}</Select></Campo>
      ) : <input type="hidden" name="reservaId" value={reservaId} />}
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo etiqueta="Tipo"><Select name="tipo" defaultValue={v.tipo ?? "IDA"}>{Object.entries(TIPOS_TRASLADO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Campo>
        <Campo etiqueta="Fecha"><Input type="date" name="fecha" defaultValue={v.fecha} required /></Campo>
        <Campo etiqueta="Hora de recogida"><Input type="time" name="hora" defaultValue={v.hora} required /></Campo>
        <Campo etiqueta="Duración (min)"><Input type="number" name="duracion" min={15} max={720} step={5} defaultValue={v.duracion ?? 60} required /></Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Recoger en"><Input name="origen" defaultValue={v.origen} placeholder="Hotel Riu, habitación 214" required /></Campo>
        <Campo etiqueta="Llevar a"><Input name="destino" defaultValue={v.destino} placeholder="Marina Cabo San Lucas" required /></Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo etiqueta="Pasajeros"><Input type="number" name="pax" min={1} defaultValue={v.pax ?? 1} required /></Campo>
        <Campo etiqueta="Unidad"><Select name="unidadId" defaultValue={v.unidadId ?? ""}><option value="">Sin asignar</option>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.capacidad} pax)</option>)}</Select></Campo>
        <Campo etiqueta="Chofer"><Select name="choferId" defaultValue={v.choferId ?? ""}><option value="">Sin asignar</option>{choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Campo>
        <Campo etiqueta="Precio" ayuda="Se cobra aparte de la reserva"><Input name="precio" inputMode="decimal" defaultValue={v.precio} placeholder="0.00" /></Campo>
      </div>
      <Campo etiqueta="Notas"><Textarea name="notas" defaultValue={v.notas ?? ""} placeholder="Equipaje, silla para niño, quién recibe…" /></Campo>
    </div>
  );
}
