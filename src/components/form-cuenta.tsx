import { Campo, Input, Select, Textarea } from "./ui";
import { TIPOS_CUENTA } from "@/lib/etiquetas";

type V = { nombre?: string; tipo?: string; moneda?: string; saldoInicialCentavos?: number; notas?: string | null; activa?: boolean };

export function CamposCuenta({ v = {}, conActiva = false }: { v?: V; conActiva?: boolean }) {
  return (
    <div className="space-y-4">
      <Campo etiqueta="Nombre"><Input name="nombre" defaultValue={v.nombre} placeholder="Caja oficina, Banorte MXN…" required /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Tipo"><Select name="tipo" defaultValue={v.tipo ?? "BANCO"}>{Object.entries(TIPOS_CUENTA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Campo>
        <Campo etiqueta="Moneda"><Select name="moneda" defaultValue={v.moneda ?? "MXN"}><option value="MXN">Pesos (MXN)</option><option value="USD">Dólares (USD)</option></Select></Campo>
      </div>
      <Campo etiqueta="Saldo inicial" ayuda="Lo que ya había al empezar a usar el sistema (puede ser negativo en una tarjeta)">
        <Input name="saldoInicial" inputMode="decimal" defaultValue={v.saldoInicialCentavos ? String(v.saldoInicialCentavos / 100) : ""} />
      </Campo>
      <Campo etiqueta="Notas"><Textarea name="notas" defaultValue={v.notas ?? ""} /></Campo>
      {conActiva && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activa" defaultChecked={v.activa ?? true} /> Activa (se puede usar en movimientos nuevos)</label>}
    </div>
  );
}
