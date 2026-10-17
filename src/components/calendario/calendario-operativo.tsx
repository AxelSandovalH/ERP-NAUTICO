"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import esLocale from "@fullcalendar/core/locales/es";
import type { DatesSetArg, EventClickArg, EventContentArg } from "@fullcalendar/core";
import { CalendarClock, Plus, Search, Ship, Users, Wrench, X } from "lucide-react";
import type { BarcoFlota, EventoCal, PropBloqueo, PropReserva } from "@/lib/calendario/tipos";
import { DisponibilidadDia } from "./disponibilidad-dia";
import { EventoTooltip, type TooltipEstado } from "./evento-tooltip";

type Props = {
  eventosIniciales: EventoCal[];
  /** Ventana (YYYY-MM-DD, fin exclusivo) que ya cubren eventosIniciales */
  ventana: { start: string; end: string };
  flota: BarcoFlota[];
  puedeCrear: boolean;
  moneda: string;
  vistaInicial: string;
  fechaInicial?: string;
};

const VISTAS = ["dayGridMonth", "timeGridWeek", "timeGridDay", "listWeek"];
const ESTADO_LABEL = { PENDIENTE: "Pendiente", CONFIRMADA: "Confirmada", COMPLETADA: "Completada", CANCELADA: "Cancelada" } as const;

// Rayas diagonales para reservas sin anticipo, con un lavado blanco encima para
// que se distingan de las confirmadas pero conserven el color de su barco.
const RAYAS = "repeating-linear-gradient(-45deg, transparent, transparent 44px, rgba(255,255,255,0.9) 44px, rgba(255,255,255,0.9) 58px)";
const LAVADO = "linear-gradient(rgba(255,255,255,0.68), rgba(255,255,255,0.68))";

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "8:30a" — formato compacto para tarjetas de una línea */
function horaCorta(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "a" : "p"}`;
}
function horaLarga(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
}

// Orden por omisión de FullCalendar, explícito: pasarle `undefined` no equivale a omitir la prop.
const ORDEN = "start,-duration,allDay,title";

export function CalendarioOperativo({ eventosIniciales, ventana, flota, puedeCrear, moneda, vistaInicial, fechaInicial }: Props) {
  const router = useRouter();
  const calRef = useRef<FullCalendar>(null);
  const [eventos, setEventos] = useState<EventoCal[]>(eventosIniciales);
  const cargados = useRef<{ start: string; end: string }[]>([ventana]);

  const [filtros, setFiltros] = useState<Set<string>>(new Set());
  const [verBloqueos, setVerBloqueos] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState(VISTAS.includes(vistaInicial) ? vistaInicial : "dayGridMonth");
  const [rango, setRango] = useState<{ start: Date; end: Date } | null>(null);
  const [fechaActual, setFechaActual] = useState<string>(fechaInicial ?? "");
  const [tooltip, setTooltip] = useState<TooltipEstado | null>(null);
  const [bloqueoSel, setBloqueoSel] = useState<PropBloqueo | null>(null);
  const [dispOpen, setDispOpen] = useState(false);
  const [movil, setMovil] = useState(false);

  useEffect(() => {
    const f = () => setMovil(window.innerWidth < 768);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  // Tras router.refresh() el servidor manda la foto fresca de su ventana: dentro
  // de ella manda el servidor (altas, bajas, cambios); fuera se conserva lo cargado.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEventos((prev) => {
      const ids = new Set(eventosIniciales.map((e) => e.id));
      const fuera = prev.filter((e) => {
        if (ids.has(e.id)) return false;
        const d = e.start.slice(0, 10);
        return d < ventana.start || d >= ventana.end;
      });
      return [...eventosIniciales, ...fuera];
    });
  }, [eventosIniciales, ventana]);

  /** Al navegar a un rango fuera de lo ya cargado, lo pide y lo fusiona. */
  const alCambiarRango = useCallback((arg: DatesSetArg) => {
    setVista(arg.view.type);
    setRango({ start: arg.view.activeStart, end: arg.view.activeEnd });
    // currentStart = inicio del periodo mostrado (en mes, el día 1; no el inicio de la cuadrícula)
    const cur = isoLocal(arg.view.currentStart);
    setFechaActual(cur);
    // La URL conserva vista y día: al volver de una reserva se restaura el contexto
    const url = new URL(window.location.href);
    url.searchParams.set("vista", arg.view.type);
    url.searchParams.set("fecha", cur);
    window.history.replaceState(null, "", url);

    const start = isoLocal(arg.view.activeStart), end = isoLocal(arg.view.activeEnd);
    if (cargados.current.some((r) => r.start <= start && r.end >= end)) return;
    fetch(`/api/calendario/eventos?start=${start}&end=${end}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((nuevos: EventoCal[]) => {
        cargados.current.push({ start, end });
        setEventos((prev) => {
          const ids = new Set(nuevos.map((e) => e.id));
          return [...prev.filter((e) => !ids.has(e.id)), ...nuevos];
        });
      })
      .catch(() => { /* se queda lo que ya había */ });
  }, []);

  const embarcacionesConEventos = flota;

  const eventosVisibles = useMemo(() => {
    const q = sinAcentos(busqueda.trim());
    return eventos.filter((e) => {
      const p = e.extendedProps;
      if (p.tipo === "bloqueo" && !verBloqueos) return false;
      if (filtros.size > 0 && !filtros.has(p.embarcacionId)) return false;
      if (!q) return true;
      const extra = p.tipo === "reserva" ? `${p.vendedor ?? ""} ${p.telefono ?? ""} ${p.folio}` : p.motivo;
      return sinAcentos(`${e.title} ${p.embarcacion} ${extra}`).includes(q);
    });
  }, [eventos, filtros, verBloqueos, busqueda]);

  // Resumen del día visible
  const resumenDia = useMemo(() => {
    if (vista !== "timeGridDay" || !rango) return null;
    const dia = isoLocal(rango.start);
    const delDia = eventosVisibles.filter((e) => e.extendedProps.tipo === "reserva" && e.start.slice(0, 10) === dia);
    return { salidas: delDia.length, pax: delDia.reduce((a, e) => a + (e.extendedProps as PropReserva).personas, 0) };
  }, [vista, rango, eventosVisibles]);

  // Vista de día: acota la rejilla a las horas con actividad para que el día entre sin scroll
  const rangoDia = useMemo(() => {
    if (vista !== "timeGridDay" || !rango) return null;
    const dia = isoLocal(rango.start);
    const delDia = eventosVisibles.filter((e) => !e.allDay && e.start.slice(0, 10) === dia);
    if (delDia.length === 0) return null;
    let minH = 24, maxH = 0;
    for (const e of delDia) {
      const ini = Number(e.start.slice(11, 13));
      const fin = Number(e.end.slice(11, 13)) + (Number(e.end.slice(14, 16)) > 0 ? 1 : 0);
      minH = Math.min(minH, ini);
      maxH = Math.max(maxH, fin);
    }
    const hh = (n: number) => `${String(n).padStart(2, "0")}:00:00`;
    return { desde: hh(Math.max(0, minH - 1)), hasta: hh(Math.min(24, maxH + 1)) };
  }, [vista, rango, eventosVisibles]);

  const hayTodoElDia = useMemo(() => {
    if (!rango) return true;
    const a = isoLocal(rango.start), b = isoLocal(rango.end);
    return eventosVisibles.some((e) => e.allDay && e.start.slice(0, 10) < b && e.end.slice(0, 10) > a);
  }, [eventosVisibles, rango]);

  const alClickEvento = useCallback((info: EventClickArg) => {
    setTooltip(null);
    const p = info.event.extendedProps as PropReserva | PropBloqueo;
    // En celular y vista mes, tocar un evento lleva al día (como Papillon)
    if (window.innerWidth < 768 && info.view.type === "dayGridMonth" && info.event.start) {
      calRef.current?.getApi().changeView("timeGridDay", info.event.start);
      return;
    }
    if (p.tipo === "bloqueo") { setBloqueoSel(p); return; }
    const api = calRef.current?.getApi();
    const dia = api ? isoLocal(api.view.currentStart) : "";
    router.push(`/reservas/${p.reservaId}?from=calendario&vista=${api?.view.type ?? "dayGridMonth"}&fecha=${dia}`);
  }, [router]);

  const alClickFecha = useCallback((info: { date: Date; dateStr: string; view: { type: string } }) => {
    const api = calRef.current?.getApi();
    if (info.view.type === "timeGridDay" && puedeCrear) {
      // Hueco libre en la vista de día: crear reserva con el horario ya puesto
      const hora = `${String(info.date.getHours()).padStart(2, "0")}:${String(info.date.getMinutes()).padStart(2, "0")}`;
      router.push(`/reservas/nueva?fecha=${isoLocal(info.date)}&inicio=${hora}`);
      return;
    }
    api?.changeView("timeGridDay", info.date);
  }, [router, puedeCrear]);

  const alEntrar = useCallback((info: { event: { id: string; extendedProps: Record<string, unknown> }; jsEvent: MouseEvent; el: HTMLElement; view: { type: string } }) => {
    if (!["dayGridMonth", "timeGridWeek", "timeGridDay"].includes(info.view.type)) return;
    // En táctil el tap ya abre el detalle; el tooltip taparía a los vecinos
    if (window.matchMedia?.("(hover: none)").matches) return;
    setTooltip({
      props: info.event.extendedProps as PropReserva | PropBloqueo,
      x: info.jsEvent.clientX, y: info.jsEvent.clientY,
      rect: info.el.getBoundingClientRect(),
    });
  }, []);

  const alternar = (id: string) => setFiltros((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // "Nueva reserva": el día mostrado si estás en vista de día; si no, hoy
  const fechaNueva = vista === "timeGridDay" && fechaActual ? fechaActual : isoLocal(new Date());

  return (
    <div className="cal flex h-full min-h-[560px] flex-col gap-2">
      {/* Encabezado: título, resumen del día y acciones en una sola fila */}
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <div className="shrink-0">
          <h1 className="text-lg font-bold leading-tight">Calendario operativo</h1>
          <p className="text-[11px] text-muted">Fuente única de verdad de la operación</p>
        </div>
        {resumenDia && (
          <div className="mx-auto flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-lg border border-line bg-brand-soft px-2.5 py-1 text-sm">
              <Ship className="h-3.5 w-3.5 text-brand" /><b>{resumenDia.salidas}</b><span className="text-xs text-muted">salidas</span>
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-sm">
              <Users className="h-3.5 w-3.5 text-muted" /><b>{resumenDia.pax}</b><span className="text-xs text-muted">pax</span>
            </span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setDispOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-brand-soft">
            <CalendarClock className="h-4 w-4" /> Disponibilidad
          </button>
          {puedeCrear && (
            <Link href={`/reservas/nueva?fecha=${fechaNueva}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-fg hover:opacity-90">
              <Plus className="h-4 w-4" /> Nueva reserva
            </Link>
          )}
        </div>
      </div>

      {/* Buscador + chips de flota (scroll propio: no estiran la página) */}
      <div className="flex max-w-full shrink-0 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente, barco…"
            className="h-8 w-48 rounded-full border border-line bg-surface pl-8 pr-7 text-[12px] outline-none transition-all focus:w-60 focus:border-brand" />
          {busqueda && (
            <button onClick={() => setBusqueda("")} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button onClick={() => setFiltros(new Set())}
          className="shrink-0 whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted transition-all hover:bg-brand-soft"
          style={{ opacity: filtros.size > 0 ? 1 : 0, pointerEvents: filtros.size > 0 ? "auto" : "none" }}>
          ✕ Todos
        </button>
        {embarcacionesConEventos.map((b) => {
          const sel = filtros.has(b.id);
          const activo = filtros.size === 0 || sel;
          return (
            <button key={b.id} onClick={() => alternar(b.id)}
              className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium text-white transition-all"
              style={{ backgroundColor: b.color, opacity: activo ? 1 : 0.3, boxShadow: sel ? "0 0 0 2px var(--surface), 0 0 0 4px var(--foreground)" : undefined }}>
              {b.nombre}
            </button>
          );
        })}
        <button onClick={() => setVerBloqueos((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-slate-700 px-2.5 py-1 text-[11px] font-medium text-white transition-all"
          style={{ opacity: verBloqueos ? 1 : 0.3 }}>
          <Wrench className="h-3 w-3" /> Bloqueos
        </button>
        <span className="ml-1 hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-muted md:flex">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: `${RAYAS}, ${LAVADO}, #0369a1` }} /> sin anticipo
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          locale={esLocale}
          initialView={vista}
          initialDate={fechaInicial}
          customButtons={{ listaBtn: { text: "Lista", click: () => calRef.current?.getApi().changeView("listWeek") } }}
          headerToolbar={movil
            ? { left: "prev,next", center: "title", right: "dayGridMonth,timeGridDay" }
            : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listaBtn" }}
          buttonText={{ today: "Hoy", month: "Mes", week: "Semana", day: "Día" }}
          slotMinTime={rangoDia?.desde ?? "00:00:00"}
          slotMaxTime={rangoDia?.hasta ?? "24:00:00"}
          scrollTime={rangoDia?.desde ?? "07:00:00"}
          slotLabelFormat={{ hour: "numeric", hour12: true }}
          slotDuration={vista === "timeGridDay" ? "01:00:00" : "00:30:00"}
          allDaySlot={hayTodoElDia || !movil}
          allDayText=""
          height="100%"
          events={eventosVisibles}
          eventClick={alClickEvento}
          dateClick={alClickFecha}
          datesSet={alCambiarRango}
          eventMouseEnter={alEntrar}
          eventMouseLeave={() => setTooltip(null)}
          eventContent={(info) => renderEvento(info, movil)}
          eventOrder={ORDEN}
          navLinks
          navLinkDayClick={(date) => calRef.current?.getApi().changeView("timeGridDay", date)}
          nowIndicator
          expandRows
          stickyHeaderDates
          fixedWeekCount={false}
          dayMaxEvents={movil ? 3 : 4}
          slotEventOverlap={false}
          eventMaxStack={vista === "timeGridDay" ? 99 : 3}
          eventMinHeight={movil ? 64 : 52}
          eventShortHeight={movil ? 64 : 52}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: true }}
          listDaySideFormat={{ weekday: "long" }}
          listDayFormat={{ day: "numeric", month: "long", year: "numeric" }}
          noEventsContent="Sin actividad para este período"
          eventDidMount={(info) => {
            const p = info.event.extendedProps as PropReserva | PropBloqueo;
            // Rayas + lavado: solo vistas de cuadrícula (la lista usa su propio estilo)
            if (p.tipo === "reserva" && p.sinAnticipo && !info.view.type.startsWith("list")) {
              info.el.style.setProperty("background-color", info.event.backgroundColor || "#64748b", "important");
              info.el.style.setProperty("background-image", `${RAYAS}, ${LAVADO}`, "important");
            }
          }}
        />
      </div>

      {tooltip && typeof document !== "undefined" && createPortal(<EventoTooltip t={tooltip} moneda={moneda} />, document.body)}

      {bloqueoSel && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setBloqueoSel(null)}>
          <aside className="h-full w-full max-w-sm overflow-y-auto bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4" /> Bloqueo</h2>
              <button onClick={() => setBloqueoSel(null)} aria-label="Cerrar"><X className="h-5 w-5" /></button>
            </div>
            <dl className="grid grid-cols-[90px_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Embarcación</dt><dd>{bloqueoSel.embarcacion}</dd>
              <dt className="text-muted">Desde</dt><dd>{bloqueoSel.desde}</dd>
              <dt className="text-muted">Hasta</dt><dd>{bloqueoSel.hasta}</dd>
              <dt className="text-muted">Motivo</dt><dd>{bloqueoSel.motivo}</dd>
            </dl>
            <Link href={`/flota/${bloqueoSel.embarcacionId}`} className="mt-5 inline-block text-sm font-medium text-brand">
              Ver en la ficha de la embarcación →
            </Link>
          </aside>
        </div>
      )}

      {dispOpen && <DisponibilidadDia fechaInicial={vista === "timeGridDay" && fechaActual ? fechaActual : undefined} onClose={() => setDispOpen(false)} />}
    </div>
  );
}

/* ─── render de eventos por vista ─────────────────────────────── */
function renderEvento(info: EventContentArg, movil: boolean) {
  const p = info.event.extendedProps as PropReserva | PropBloqueo;
  const bg = info.event.backgroundColor;
  const vista = info.view.type;
  const mes = vista === "dayGridMonth";
  const lista = vista.startsWith("list");

  if (p.tipo === "bloqueo") {
    const txt = p.textoOscuro ? "text-slate-900" : "text-white";
    if (lista) {
      return (
        <div className="flex w-full items-center gap-3 py-1">
          <div className="w-1 shrink-0 self-stretch rounded-full" style={{ backgroundColor: bg }} />
          <Wrench className="h-3.5 w-3.5 shrink-0" style={{ color: bg }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Bloqueo · {p.embarcacion}</p>
            <p className="text-xs text-muted">{p.motivo} · {p.desde} → {p.hasta}</p>
          </div>
        </div>
      );
    }
    // En angosto el rótulo arranca por el barco: el ícono ya dice que es un bloqueo
    const texto = movil ? p.embarcacion : `Bloqueo · ${p.embarcacion}`;
    return (
      <div className={`flex w-full items-center gap-1 overflow-hidden rounded-md px-1.5 py-[2px] ${txt}`} style={{ backgroundColor: bg }}>
        <Wrench className="h-2.5 w-2.5 shrink-0 opacity-85" />
        <span className="truncate text-[11px] font-semibold leading-tight">{texto}</span>
      </div>
    );
  }

  const oscuro = p.sinAnticipo || p.textoOscuro; // con rayas hay lavado blanco encima
  const txt = oscuro ? "text-slate-900" : "text-white";
  const txtSoft = oscuro ? "text-slate-700" : "text-white";

  if (mes) {
    const estilo = p.sinAnticipo
      ? { backgroundColor: bg, backgroundImage: `${RAYAS}, ${LAVADO}` }
      : { backgroundColor: bg };
    return (
      <div className="flex w-full items-baseline gap-1 overflow-hidden rounded-md px-1.5 py-[2px]" style={estilo}>
        <span className={`shrink-0 text-[10px] font-semibold tabular-nums leading-tight ${txtSoft}`}>{horaCorta(p.horaInicio)}</span>
        <span className={`truncate text-[10px] font-bold leading-tight ${txt}`}>{p.cliente}</span>
        {!movil && <span className={`ml-auto shrink-0 text-[10px] font-semibold leading-tight ${txtSoft}`}>{p.vendedorAbrev}</span>}
        <span className={`shrink-0 text-[10px] font-semibold tabular-nums leading-tight ${txtSoft} ${movil ? "ml-auto" : ""}`}>{p.personas}px</span>
      </div>
    );
  }

  if (lista) {
    return (
      <div className="flex w-full items-center gap-3 py-1">
        <div className="w-1 shrink-0 self-stretch rounded-full" style={{ backgroundColor: bg }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{p.cliente} <span className="font-normal text-muted">#{p.folio}</span></p>
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1"><Ship className="h-3 w-3" />{p.embarcacion}</span>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{p.personas} pax</span>
            <span>{horaLarga(p.horaInicio)} – {horaLarga(p.horaFin)}</span>
            {p.vendedor && <span>{p.vendedor}</span>}
          </div>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: bg, color: p.textoOscuro ? "#0f172a" : "#fff" }}>
          {ESTADO_LABEL[p.estado]}
        </span>
      </div>
    );
  }

  if (vista === "timeGridDay") {
    return (
      <div className={`flex h-full w-full flex-col gap-1 overflow-hidden ${movil ? "px-2 py-1" : "px-3 py-2"} ${txt}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-[11px] font-bold">{horaLarga(p.horaInicio)} – {horaLarga(p.horaFin)}</span>
          <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[9px]">{ESTADO_LABEL[p.estado]}</span>
        </div>
        <p className="truncate text-[13px] font-bold leading-snug">{info.event.title}</p>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="flex min-w-0 items-center gap-1"><Ship className="h-3 w-3 shrink-0" /><span className="truncate">{p.embarcacion}</span></span>
          <span className="flex shrink-0 items-center gap-1"><Users className="h-3 w-3" />{p.personas} pax</span>
        </div>
        {p.cobro !== "LIQUIDADA" && (
          <span className="mt-auto w-fit rounded-full bg-black/10 px-1.5 py-0.5 text-[9px]">
            {p.cobro === "PARCIAL" ? "Anticipo recibido" : "Sin anticipo"}
          </span>
        )}
      </div>
    );
  }

  // Semana
  return (
    <div className={`flex h-full w-full flex-col justify-start gap-0.5 overflow-hidden px-2 py-1.5 ${txt}`}>
      <div className="flex items-center gap-1">
        <span className="shrink-0 text-[10px] font-bold tabular-nums opacity-85">{horaCorta(p.horaInicio)}</span>
        <span className="ml-auto shrink-0 text-[10px] font-bold opacity-85">{p.vendedorAbrev}</span>
      </div>
      <p className="truncate text-[11px] font-semibold leading-snug">{p.cliente}</p>
      <p className="text-[10px] tabular-nums opacity-85">{p.personas} pax</p>
    </div>
  );
}

