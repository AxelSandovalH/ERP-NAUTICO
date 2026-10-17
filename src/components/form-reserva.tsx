"use client";
import { useState } from "react";
import { Campo, Input, Select, Textarea } from "./ui";
import { Formulario } from "./formulario";
import { ORIGENES } from "@/lib/etiquetas";
import { crearReserva } from "@/app/(app)/reservas/actions";

type Tarifa = { id: string; nombre: string; duracionMin: number; precioCentavos: number };
type Emb = { id: string; nombre: string; capacidad: number; tarifas: Tarifa[] };
type Cli = { id: string; nombre: string };
type Ben = { id: string; nombre: string; tipo: string };

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const aMin = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };

export function FormReserva({
  embarcaciones, clientes, beneficiarios, inicial,
}: { embarcaciones: Emb[]; clientes: Cli[]; beneficiarios?: Ben[]; inicial: { fecha: string; embarcacionId?: string; inicio?: string; clienteId?: string; beneficiarioId?: string } }) {
  const [embId, setEmbId] = useState(inicial.embarcacionId ?? embarcaciones[0]?.id ?? "");
  const [tarifaId, setTarifaId] = useState("");
  const [inicio, setInicio] = useState(inicial.inicio ?? "10:00");
  const [fin, setFin] = useState(hhmm(aMin(inicial.inicio ?? "10:00") + 240));
  const [total, setTotal] = useState("");
  const [clienteId, setClienteId] = useState(inicial.clienteId ?? "");

  const emb = embarcaciones.find((e) => e.id === embId);

  function elegirTarifa(id: string, hora = inicio) {
    setTarifaId(id);
    const t = emb?.tarifas.find((x) => x.id === id);
    if (t) {
      setFin(hhmm(aMin(hora) + t.duracionMin));
      setTotal(String(t.precioCentavos / 100));
    }
  }

  return (
    <Formulario accion={crearReserva} enviar="Crear reserva" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Embarcación">
          <Select name="embarcacionId" value={embId} onChange={(e) => { setEmbId(e.target.value); setTarifaId(""); }} required>
            {embarcaciones.map((e) => <option key={e.id} value={e.id}>{e.nombre} (máx. {e.capacidad})</option>)}
          </Select>
        </Campo>
        <Campo etiqueta="Tarifa" ayuda="Rellena la hora final y el total">
          <Select name="tarifaId" value={tarifaId} onChange={(e) => elegirTarifa(e.target.value)}>
            <option value="">— Sin tarifa (precio libre) —</option>
            {emb?.tarifas.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {t.duracionMin / 60} h</option>)}
          </Select>
        </Campo>
        <Campo etiqueta="Fecha"><Input name="fecha" type="date" defaultValue={inicial.fecha} required /></Campo>
        <Campo etiqueta="Pasajeros"><Input name="pax" type="number" min={1} max={emb?.capacidad} defaultValue={2} required /></Campo>
        <Campo etiqueta="Hora de inicio">
          <Input name="inicio" type="time" value={inicio} required
            onChange={(e) => { setInicio(e.target.value); if (tarifaId) elegirTarifa(tarifaId, e.target.value); }} />
        </Campo>
        <Campo etiqueta="Hora de fin"><Input name="fin" type="time" value={fin} onChange={(e) => setFin(e.target.value)} required /></Campo>
        <Campo etiqueta="Total"><Input name="total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="9500" /></Campo>
        <Campo etiqueta="Origen">
          <Select name="origen" defaultValue="DIRECTO">
            {Object.entries(ORIGENES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Campo>
      </div>

      {beneficiarios && (
        <Campo etiqueta="Vendedor / agencia (comisión)" ayuda="Quién vendió o trajo la reserva: a esa persona se le calcula la comisión">
          <Select name="beneficiarioId" defaultValue={inicial.beneficiarioId ?? ""}>
            <option value="">— Sin comisión —</option>
            {beneficiarios.map((b) => <option key={b.id} value={b.id}>{b.nombre} ({b.tipo.toLowerCase()})</option>)}
          </Select>
        </Campo>
      )}

      <fieldset className="space-y-4 rounded-xl border border-line p-4">
        <legend className="px-2 text-sm font-semibold">Cliente</legend>
        <Campo etiqueta="Cliente existente">
          <Select name="clienteId" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">— Nuevo cliente —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
        </Campo>
        {!clienteId && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Nombre"><Input name="clienteNombre" /></Campo>
            <Campo etiqueta="Teléfono"><Input name="clienteTelefono" type="tel" /></Campo>
            <Campo etiqueta="Correo"><Input name="clienteEmail" type="email" /></Campo>
          </div>
        )}
      </fieldset>

      <Campo etiqueta="Notas"><Textarea name="notas" /></Campo>
    </Formulario>
  );
}
