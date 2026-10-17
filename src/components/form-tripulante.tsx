import { Campo, Input, Select, Textarea } from "./ui";
import { ROLES_TRIPULANTE } from "@/lib/etiquetas";

type V = { nombre?: string; apellido?: string; rol?: string; email?: string | null; telefono?: string | null; notas?: string | null; activo?: boolean };

export function CamposTripulante({ v = {}, flota, fijas = [], conActivo = false }: { v?: V; flota: { id: string; nombre: string; color: string }[]; fijas?: string[]; conActivo?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre"><Input name="nombre" defaultValue={v.nombre} required /></Campo>
      <Campo etiqueta="Apellido"><Input name="apellido" defaultValue={v.apellido} /></Campo>
      <Campo etiqueta="Rol">
        <Select name="rol" defaultValue={v.rol ?? "CAPITAN"}>{Object.entries(ROLES_TRIPULANTE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Campo>
      <Campo etiqueta="Teléfono"><Input name="telefono" type="tel" defaultValue={v.telefono ?? ""} /></Campo>
      <Campo etiqueta="Correo" className="sm:col-span-2"><Input name="email" type="email" defaultValue={v.email ?? ""} /></Campo>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Embarcaciones fijas</legend>
        {flota.length === 0 ? <p className="text-sm text-muted">Aún no hay embarcaciones.</p> : (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {flota.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="embarcacionId" value={e.id} defaultChecked={fijas.includes(e.id)} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />{e.nombre}
              </label>
            ))}
          </div>
        )}
        <p className="mt-1 text-xs text-muted">Se sugieren primero al asignar tripulación a una reserva de esa embarcación.</p>
      </fieldset>
      {conActivo && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="activo" defaultChecked={v.activo ?? true} /> Activo (puede asignarse a reservas)
        </label>
      )}
      <Campo etiqueta="Notas" className="sm:col-span-2"><Textarea name="notas" defaultValue={v.notas ?? ""} /></Campo>
    </div>
  );
}
