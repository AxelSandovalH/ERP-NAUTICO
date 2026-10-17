import { Campo, Input, Select } from "./ui";
import { TIPOS_BENEFICIARIO } from "@/lib/etiquetas";

type V = { nombre?: string; tipo?: string; contacto?: string | null; usuarioId?: string | null; activo?: boolean };

export function CamposBeneficiario({ v = {}, usuarios, conActivo = false }: { v?: V; usuarios: { id: string; nombre: string; email: string }[]; conActivo?: boolean }) {
  return (
    <div className="space-y-4">
      <Campo etiqueta="Nombre"><Input name="nombre" defaultValue={v.nombre} required /></Campo>
      <Campo etiqueta="Tipo">
        <Select name="tipo" defaultValue={v.tipo ?? "VENDEDOR"}>{Object.entries(TIPOS_BENEFICIARIO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Campo>
      <Campo etiqueta="Usuario del sistema" ayuda="Para vendedores internos: así ven sus propias comisiones y se les preselecciona al crear reservas">
        <Select name="usuarioId" defaultValue={v.usuarioId ?? ""}>
          <option value="">— Ninguno (tercero externo) —</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.email}</option>)}
        </Select>
      </Campo>
      <Campo etiqueta="Contacto"><Input name="contacto" defaultValue={v.contacto ?? ""} placeholder="Teléfono, correo…" /></Campo>
      {conActivo && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activo" defaultChecked={v.activo ?? true} /> Activo</label>}
    </div>
  );
}
