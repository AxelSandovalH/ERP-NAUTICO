import { AlertTriangle, ArrowLeftRight, Check, CheckCircle2, Clock, FileText, MapPin, Ship, UsersRound } from "lucide-react";
import type { ReactNode } from "react";

/** Piezas estilizadas de la interfaz, dibujadas con HTML (sin capturas): imitan cómo está construido cada módulo con datos de ejemplo. */
function Pieza({ titulo, texto, children }: { titulo: string; texto: string; children: ReactNode }) {
  return (
    <figure className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div aria-hidden className="flex-1 select-none rounded-xl border border-line bg-background p-3 text-left">{children}</div>
      <figcaption className="mt-4 px-1">
        <p className="font-semibold">{titulo}</p>
        <p className="mt-0.5 text-sm text-muted">{texto}</p>
      </figcaption>
    </figure>
  );
}

const TONOS = { ok: "bg-emerald-100 text-emerald-700", aviso: "bg-amber-100 text-amber-700", marca: "bg-brand-soft text-brand" };
const Etiqueta = ({ tono, children }: { tono: keyof typeof TONOS; children: ReactNode }) => (
  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TONOS[tono]}`}>{children}</span>
);

function Reserva() {
  return (
    <div className="space-y-2.5 text-xs">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-semibold"><Ship className="h-3.5 w-3.5 text-brand" />Catamarán Luna</p>
        <Etiqueta tono="ok">Confirmada</Etiqueta>
      </div>
      <p className="text-muted">Sáb 11 · 10:00 a 14:00 · 12 pasajeros</p>
      <div className="rounded-lg bg-surface p-2.5">
        <div className="flex justify-between"><span className="text-muted">Total</span><span className="font-semibold">$18,000</span></div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full w-2/3 rounded-full bg-brand" /></div>
        <div className="mt-1 flex justify-between text-[10px] text-muted"><span>Anticipo $12,000</span><span>Resta $6,000</span></div>
      </div>
    </div>
  );
}

function Equipo() {
  const gente = [["Capitán", "Mario R.", "08:30"], ["Marinero", "Luis G.", "08:45"], ["Anfitriona", "Sofía M.", "09:00"]];
  return (
    <ul className="space-y-2 text-xs">
      {gente.map(([rol, nombre, hora]) => (
        <li key={rol} className="flex items-center gap-2.5 rounded-lg bg-surface p-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-[10px] font-semibold text-pato">{nombre[0]}</span>
          <span className="min-w-0 flex-1"><span className="block font-medium">{nombre}</span><span className="text-[10px] text-muted">{rol}</span></span>
          <span className="flex items-center gap-1 text-[10px] text-muted"><Clock className="h-3 w-3" />{hora}</span>
        </li>
      ))}
    </ul>
  );
}

function Horario() {
  const dias = ["L", "M", "M", "J", "V", "S", "D"];
  const filas: [string, string[]][] = [["Mario", ["T", "T", "T", "T", "-", "T", "D"]], ["Luis", ["-", "T", "T", "V", "V", "T", "T"]], ["Sofía", ["T", "-", "T", "T", "T", "T", "-"]]];
  const color: Record<string, string> = { T: "bg-brand/80 text-white", V: "bg-amber-300 text-amber-900", D: "bg-slate-300 text-slate-700", "-": "bg-transparent text-transparent" };
  return (
    <div className="space-y-1 text-[10px]">
      <div className="grid grid-cols-[3rem_repeat(7,1fr)] gap-1 text-center text-muted"><span />{dias.map((d, i) => <span key={i}>{d}</span>)}</div>
      {filas.map(([n, c]) => (
        <div key={n} className="grid grid-cols-[3rem_repeat(7,1fr)] items-center gap-1 text-center">
          <span className="truncate text-left font-medium">{n}</span>
          {c.map((x, i) => <span key={i} className={`rounded py-1 font-semibold ${color[x]}`}>{x}</span>)}
        </div>
      ))}
      <p className="pt-1 text-muted">T turno · V vacaciones · D descanso</p>
    </div>
  );
}

function Conciliacion() {
  const movimientos: [string, string, boolean][] = [["Depósito reserva Luna", "+$12,000", true], ["Pago combustible", "−$3,450", true], ["Transferencia sin identificar", "+$2,800", false]];
  return (
    <div className="space-y-2 text-xs">
      {movimientos.map(([t, m, ok]) => (
        <div key={t} className="flex items-center gap-2 rounded-lg bg-surface p-2">
          {ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
          <span className="min-w-0 flex-1 truncate">{t}</span>
          <span className="font-medium tabular-nums">{m}</span>
        </div>
      ))}
      <p className="flex items-center gap-1 text-[10px] text-muted"><ArrowLeftRight className="h-3 w-3" />2 de 3 movimientos conciliados</p>
    </div>
  );
}

function Factura() {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between"><p className="flex items-center gap-1.5 font-semibold"><FileText className="h-3.5 w-3.5 text-brand" />Factura CFDI 4.0</p><Etiqueta tono="ok">Timbrada</Etiqueta></div>
      <div className="space-y-1 rounded-lg bg-surface p-2.5">
        <div className="flex justify-between"><span className="text-muted">Subtotal</span><span>$15,517.24</span></div>
        <div className="flex justify-between"><span className="text-muted">IVA 16 %</span><span>$2,482.76</span></div>
        <div className="flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span>$18,000.00</span></div>
      </div>
      <p className="text-[10px] text-muted">PDF y XML disponibles</p>
    </div>
  );
}

function Inventario() {
  const items: [string, number, string][] = [["Hielo (bolsas)", 80, "bg-brand"], ["Agua 600 ml", 35, "bg-amber-400"], ["Combustible (L)", 12, "bg-red-500"]];
  return (
    <ul className="space-y-2.5 text-xs">
      {items.map(([n, p, c]) => (
        <li key={n}>
          <div className="mb-1 flex justify-between"><span>{n}</span>{p < 20 ? <Etiqueta tono="aviso">Bajo mínimo</Etiqueta> : <span className="text-[10px] text-muted">{p} %</span>}</div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${c}`} style={{ width: `${p}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Reporte() {
  const barras = [38, 52, 44, 68, 60, 82];
  return (
    <div className="text-xs">
      <div className="flex items-end justify-between"><div><p className="text-[10px] text-muted">Utilidad del mes</p><p className="text-base font-semibold">$86,400</p></div><Etiqueta tono="ok">+12 %</Etiqueta></div>
      <div className="mt-3 flex h-16 items-end gap-1.5">
        {barras.map((h, i) => <div key={i} className={`flex-1 rounded-t ${i === barras.length - 1 ? "bg-brand" : "bg-brand/35"}`} style={{ height: `${h}%` }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted">{["May", "Jun", "Jul", "Ago", "Sep", "Oct"].map((m) => <span key={m}>{m}</span>)}</div>
    </div>
  );
}

function Traslado() {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between"><p className="font-semibold">Traslado hotel → marina</p><Etiqueta tono="marca">En ruta</Etiqueta></div>
      <div className="flex items-center gap-2 text-muted"><MapPin className="h-3.5 w-3.5 shrink-0 text-brand" />Hotel Playa · 08:15 <span className="mx-1 h-px flex-1 bg-line" /> Marina · 08:45</div>
      <div className="flex items-center gap-2 rounded-lg bg-surface p-2"><UsersRound className="h-4 w-4 text-brand" /><span className="flex-1">Van 2 · Chofer Raúl</span><Check className="h-4 w-4 text-emerald-500" /></div>
    </div>
  );
}

export function Vitrina() {
  return (
    <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <li><Pieza titulo="Reservas con pagos parciales" texto="Anticipos, saldo pendiente y estado de cada salida."><Reserva /></Pieza></li>
      <li><Pieza titulo="Equipo asignado por salida" texto="Quién sale en cada reserva y a qué hora llega."><Equipo /></Pieza></li>
      <li><Pieza titulo="Horarios de la semana" texto="Turnos, vacaciones y descansos en una sola vista."><Horario /></Pieza></li>
      <li><Pieza titulo="Conciliación bancaria" texto="Tu estado de cuenta contra tus ingresos y gastos."><Conciliacion /></Pieza></li>
      <li><Pieza titulo="Facturación CFDI" texto="Facturas de lo que cobras, con IVA desglosado."><Factura /></Pieza></li>
      <li><Pieza titulo="Inventario con alertas" texto="Insumos por bodega y aviso al llegar al mínimo."><Inventario /></Pieza></li>
      <li><Pieza titulo="Reportes de rentabilidad" texto="Ingresos, gastos y utilidad, mes a mes."><Reporte /></Pieza></li>
      <li><Pieza titulo="Traslados de clientes" texto="Unidad, chofer, ruta y su cobro."><Traslado /></Pieza></li>
    </ul>
  );
}
