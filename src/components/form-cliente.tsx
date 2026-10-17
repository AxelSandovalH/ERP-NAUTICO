import { Campo, Input, Textarea } from "./ui";

export function CamposCliente({ v = {} }: { v?: { nombre?: string; email?: string | null; telefono?: string | null; notas?: string | null } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre"><Input name="nombre" defaultValue={v.nombre} required /></Campo>
      <Campo etiqueta="Teléfono"><Input name="telefono" type="tel" defaultValue={v.telefono ?? ""} /></Campo>
      <Campo etiqueta="Correo" className="sm:col-span-2"><Input name="email" type="email" defaultValue={v.email ?? ""} /></Campo>
      <Campo etiqueta="Notas" className="sm:col-span-2"><Textarea name="notas" defaultValue={v.notas ?? ""} /></Campo>
    </div>
  );
}
