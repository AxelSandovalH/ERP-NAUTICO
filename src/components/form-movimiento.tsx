"use client";
import { useState } from "react";
import { Campo, Input, Select, Textarea } from "./ui";
import { Formulario, type EstadoForm } from "./formulario";

type Cuenta = { id: string; nombre: string; moneda: "MXN" | "USD" };
type Opcion = { id: string; nombre: string };
type Accion = (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>;

/** Formulario de gasto o ingreso. Si la cuenta elegida está en otra moneda que la base de la
 *  empresa, pide el tipo de cambio (con el de la empresa ya puesto) y muestra el equivalente. */
export function FormMovimiento({
  tipo, accion, cuentas, categorias, embarcaciones, base, tipoCambio, hoy, cuentaInicial,
}: {
  tipo: "gasto" | "ingreso"; accion: Accion; cuentas: Cuenta[]; categorias: Opcion[]; embarcaciones?: Opcion[];
  base: "MXN" | "USD"; tipoCambio: number; hoy: string; cuentaInicial?: string;
}) {
  const [cuentaId, setCuentaId] = useState(cuentaInicial ?? cuentas[0]?.id ?? "");
  const [monto, setMonto] = useState("");
  const [tc, setTc] = useState(String(tipoCambio));
  const cuenta = cuentas.find((c) => c.id === cuentaId);
  const otraMoneda = !!cuenta && cuenta.moneda !== base;
  const n = Number(monto.replace(/[, $]/g, "")), t = Number(tc);
  const equivalente = otraMoneda && Number.isFinite(n) && n > 0 && t > 0
    ? (cuenta!.moneda === "USD" ? n * t : n / t).toLocaleString("es-MX", { style: "currency", currency: base })
    : null;

  return (
    <Formulario accion={accion} enviar={tipo === "gasto" ? "Registrar gasto" : "Registrar ingreso"} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Concepto" className="sm:col-span-2"><Input name="concepto" placeholder={tipo === "gasto" ? "Gasolina Sunseeker 80" : "Venta de souvenirs"} required autoFocus /></Campo>
        <Campo etiqueta={`Monto${cuenta ? ` (${cuenta.moneda})` : ""}`}><Input name="monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} required /></Campo>
        <Campo etiqueta="Fecha"><Input name="fecha" type="date" defaultValue={hoy} required /></Campo>
        <Campo etiqueta={tipo === "gasto" ? "Pagado con (cuenta)" : "Entró a (cuenta)"}>
          <Select name="cuentaId" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} required>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
          </Select>
        </Campo>
        <Campo etiqueta="Categoría">
          <Select name="categoriaId" defaultValue=""><option value="">— Sin categoría —</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
        </Campo>
        {otraMoneda && (
          <Campo etiqueta="Tipo de cambio (pesos por dólar)" ayuda={equivalente ? `Equivale a ${equivalente}` : "Se usa para sumar todo en la moneda base"}>
            <Input name="tipoCambio" inputMode="decimal" value={tc} onChange={(e) => setTc(e.target.value)} required />
          </Campo>
        )}
        {tipo === "gasto" && embarcaciones && (
          <Campo etiqueta="Embarcación">
            <Select name="embarcacionId" defaultValue=""><option value="">— General —</option>{embarcaciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</Select>
          </Campo>
        )}
        <Campo etiqueta="Reserva (folio)" ayuda="Opcional: liga el movimiento a una reserva"><Input name="reservaFolio" inputMode="numeric" placeholder="12" /></Campo>
        {tipo === "gasto" && <Campo etiqueta="Proveedor"><Input name="proveedor" /></Campo>}
      </div>
      {tipo === "gasto" && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requiereFactura" /> Hay que pedir factura de este gasto</label>
      )}
      <Campo etiqueta="Notas"><Textarea name="notas" /></Campo>
    </Formulario>
  );
}
