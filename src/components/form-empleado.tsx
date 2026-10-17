import { Campo, Input, Select, Textarea } from "./ui";
import { ESQUEMAS_PAGO, PERIODICIDADES } from "@/lib/etiquetas";

type V = { nombre?: string; apellido?: string; puesto?: string | null; esquema?: string; sueldoCentavos?: number; periodicidad?: string; usuarioId?: string | null; tripulanteId?: string | null; notas?: string | null; activo?: boolean };

export function CamposEmpleado({ v = {}, usuarios, tripulantes, moneda, conActivo = false }: {
  v?: V; usuarios: { id: string; nombre: string; email: string }[]; tripulantes: { id: string; nombre: string }[]; moneda: string; conActivo?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre"><Input name="nombre" defaultValue={v.nombre} required /></Campo>
      <Campo etiqueta="Apellido"><Input name="apellido" defaultValue={v.apellido} /></Campo>
      <Campo etiqueta="Puesto" className="sm:col-span-2"><Input name="puesto" defaultValue={v.puesto ?? ""} placeholder="Capitán, marinero, mantenimiento…" /></Campo>
      <Campo etiqueta="Esquema de pago">
        <Select name="esquema" defaultValue={v.esquema ?? "FIJO_PERIODO"}>{Object.entries(ESQUEMAS_PAGO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Campo>
      <Campo etiqueta="Periodicidad">
        <Select name="periodicidad" defaultValue={v.periodicidad ?? "QUINCENAL"}>{Object.entries(PERIODICIDADES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Campo>
      <Campo etiqueta={`Sueldo (${moneda})`} ayuda="Sueldo fijo de cada periodo, o el precio de cada día trabajado, según el esquema" className="sm:col-span-2">
        <Input name="sueldo" inputMode="decimal" defaultValue={v.sueldoCentavos != null ? String(v.sueldoCentavos / 100) : ""} required />
      </Campo>
      <Campo etiqueta="Usuario del sistema" ayuda="Con este usuario checa su asistencia desde el celular">
        <Select name="usuarioId" defaultValue={v.usuarioId ?? ""}>
          <option value="">— Ninguno —</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.email}</option>)}
        </Select>
      </Campo>
      <Campo etiqueta="Tripulante">
        <Select name="tripulanteId" defaultValue={v.tripulanteId ?? ""}>
          <option value="">— Ninguno —</option>{tripulantes.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </Select>
      </Campo>
      {conActivo && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="activo" defaultChecked={v.activo ?? true} /> Activo (entra en la nómina)</label>}
      <Campo etiqueta="Notas" className="sm:col-span-2"><Textarea name="notas" defaultValue={v.notas ?? ""} /></Campo>
    </div>
  );
}
