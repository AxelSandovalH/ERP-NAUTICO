import Link from "next/link";
import type { CSSProperties } from "react";
import {
  BarChart3, Banknote, Boxes, Bus, CalendarClock, CalendarDays, Check, FileText, Landmark, Menu, Percent, ShieldCheck, Ship, Smartphone, TrendingUp, UsersRound, Wallet, type LucideIcon,
} from "lucide-react";
import { LogoMarca } from "@/components/logo";
import { DIAS_PRUEBA } from "@/lib/suscripcion/prueba";
import { TASA_CARGO, TASA_IVA_SUSCRIPCION, desglosePlan } from "@/lib/stripe/suscripcion";
import { PLANES, PLANES_DE_PAGO } from "@/modules/registry";
import { dinero } from "@/lib/fechas";
import { MockProducto } from "./mock-producto";

// Sobre el fondo navy el bote del logo pasa a blanco (la ola ya es azul pato)
const SOBRE_NAVY = { "--logo-bote": "#ffffff" } as CSSProperties;

const MODULOS: { icono: LucideIcon; titulo: string; texto: string }[] = [
  { icono: CalendarDays, titulo: "Calendario y reservas", texto: "Cada salida por embarcación, día y hora, sin traslapes, con pagos parciales y estados claros." },
  { icono: Ship, titulo: "Flota", texto: "Embarcaciones, tarifas, capacidad y bloqueos por mantenimiento." },
  { icono: UsersRound, titulo: "Equipo y tripulación", texto: "Asigna a quien sale en cada reserva, con su hora de llegada." },
  { icono: CalendarClock, titulo: "Horarios", texto: "Turnos, descansos y vacaciones; cada persona ve su semana en el celular." },
  { icono: Banknote, titulo: "Asistencia y nómina", texto: "Checada por ubicación y pagos de nómina calculados desde la asistencia." },
  { icono: Percent, titulo: "Comisiones", texto: "Reglas por vendedor o agencia, calculadas solas con cada venta." },
  { icono: Wallet, titulo: "Ingresos y gastos", texto: "Efectivo, bancos y tarjetas en pesos y dólares, con comprobantes por foto." },
  { icono: Landmark, titulo: "Conciliación bancaria", texto: "Importa tu estado de cuenta, concilia con sugerencias y cierra el mes." },
  { icono: Boxes, titulo: "Inventario", texto: "Insumos por bodega y embarcación, mermas, conteos y alertas de mínimo." },
  { icono: Bus, titulo: "Transporte", texto: "Traslados de tus clientes con unidad y chofer, su cobro y sus costos." },
  { icono: FileText, titulo: "Facturación", texto: "CFDI de lo que cobras y facturas de tus proveedores ligadas a tus gastos." },
  { icono: BarChart3, titulo: "Reportes", texto: "Ingresos, gastos, utilidad y rentabilidad por embarcación, en gráficas." },
];

const PASOS = [
  { n: "1", titulo: `Crea tu cuenta`, texto: `${DIAS_PRUEBA} días con todo incluido, sin tarjeta y sin compromiso.` },
  { n: "2", titulo: "Configura tu operación", texto: "Da de alta tus embarcaciones, tarifas, equipo y cuentas. Importa tus clientes." },
  { n: "3", titulo: "Opera y mide", texto: "Toma reservas, cobra, concilia y mira tu utilidad real por embarcación." },
];

const PREGUNTAS: { p: string; r: string }[] = [
  { p: "¿Necesito tarjeta para probar?", r: `No. Creas tu cuenta y tienes ${DIAS_PRUEBA} días con todos los módulos. Solo pagas si decides contratar un plan.` },
  { p: "¿Qué pasa cuando termina la prueba?", r: "Tus módulos se pausan y solo quedan el panel y la configuración para que elijas un plan. Tus datos no se borran: al contratar, todo sigue donde lo dejaste." },
  { p: "¿Puedo cambiar de plan después?", r: "Sí, desde la misma aplicación. Al subir de plan se cobra la diferencia proporcional del mes; al bajar, queda como saldo a favor." },
  { p: "¿Cómo se cobra? ¿Llevan IVA los precios?", r: `Los precios son mensuales y no incluyen IVA. Se suma un cargo por servicio de pago de ${TASA_CARGO * 100} % y el IVA de ${TASA_IVA_SUSCRIPCION * 100} % sobre ambos. En cada plan ves el total exacto.` },
  { p: "¿Mis datos están seguros?", r: "Cada empresa solo ve su propia información: el aislamiento se aplica en la base de datos, no solo en la pantalla. Las contraseñas las gestiona un servicio de autenticación especializado." },
  { p: "¿Funciona en el celular?", r: "Sí. Puedes tomar reservas, checar asistencia, ver tu horario y tus traslados desde el teléfono." },
  { p: "¿Cómo funciona la facturación?", r: "Emites CFDI de lo que cobras y ligas las facturas de tus proveedores a tus gastos. Está incluida desde el plan Gestión; el alta fiscal de tu empresa se hace con nuestro apoyo." },
];

const boton = "inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition-colors";

export function Landing() {
  const planes = PLANES_DE_PAGO.map((id) => ({ id, def: PLANES[id], d: desglosePlan(PLANES[id].precioMxnMensual ?? 0) }));
  return (
    <div className="scroll-smooth bg-background text-foreground">
      {/* Barra superior */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-navy/95 backdrop-blur" style={SOBRE_NAVY}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <Link href="/" aria-label="FleetNautic, inicio"><LogoMarca className="h-auto w-24" titulo="FleetNautic" /></Link>
          <nav aria-label="Secciones" className="hidden items-center gap-7 text-sm text-slate-300 md:flex">
            <a href="#modulos" className="hover:text-white">Módulos</a>
            <a href="#planes" className="hover:text-white">Planes</a>
            <a href="#preguntas" className="hover:text-white">Preguntas</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/login" className="text-sm font-medium text-slate-200 hover:text-white">Iniciar sesión</Link>
            <Link href="/registro" className={`${boton} bg-pato py-2 text-navy hover:bg-[#2dd4db]`}>Probar {DIAS_PRUEBA} días gratis</Link>
          </div>
          {/* Menú del celular, sin JavaScript */}
          <details className="group relative md:hidden">
            <summary aria-label="Abrir menú" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-white/20 text-white [&::-webkit-details-marker]:hidden"><Menu className="h-5 w-5" /></summary>
            <div className="absolute right-0 top-12 w-64 rounded-xl border border-white/10 bg-navy p-3 shadow-2xl">
              <a href="#modulos" className="block rounded-lg px-3 py-2.5 text-sm text-slate-200 hover:bg-white/10">Módulos</a>
              <a href="#planes" className="block rounded-lg px-3 py-2.5 text-sm text-slate-200 hover:bg-white/10">Planes</a>
              <a href="#preguntas" className="block rounded-lg px-3 py-2.5 text-sm text-slate-200 hover:bg-white/10">Preguntas</a>
              <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm text-slate-200 hover:bg-white/10">Iniciar sesión</Link>
              <Link href="/registro" className={`${boton} mt-2 w-full bg-pato py-2.5 text-navy`}>Probar {DIAS_PRUEBA} días gratis</Link>
            </div>
          </details>
        </div>
      </header>

      <main>
        {/* Portada */}
        <section className="relative overflow-hidden bg-navy bg-[radial-gradient(70%_60%_at_50%_0%,rgba(0,183,189,0.28),transparent)] text-white">
          <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 text-center md:px-8 md:pb-28 md:pt-24">
            <p className="mx-auto mb-5 inline-block rounded-full border border-pato/40 bg-pato/10 px-4 py-1 text-xs font-medium tracking-wide text-pato">Para operadores de charters, tours y renta de embarcaciones</p>
            <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">Tu operación náutica, <span className="text-pato">bajo control</span></h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-slate-300 md:text-lg">Reservas, tripulación, finanzas, inventario, transporte y facturación en un solo sistema, hecho para quienes viven de la flota.</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/registro" className={`${boton} bg-pato text-navy hover:bg-[#2dd4db]`}>Probar {DIAS_PRUEBA} días gratis</Link>
              <a href="#planes" className={`${boton} border border-white/25 text-white hover:bg-white/10`}>Ver planes</a>
            </div>
            <p className="mt-4 text-xs text-slate-400">Sin tarjeta. Todos los módulos durante la prueba.</p>
            <div className="mt-14 md:mt-20"><MockProducto /></div>
          </div>
        </section>

        {/* Módulos */}
        <section id="modulos" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 md:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">Todo en un solo lugar</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Deja las hojas de cálculo y los chats</h2>
            <p className="mt-4 text-muted">Cada área de tu empresa conectada con las demás: lo que se cobra en una reserva llega solo a tus ingresos, tu nómina y tus reportes.</p>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULOS.map(({ icono: Icono, titulo, texto }) => (
              <li key={titulo} className="rounded-xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icono className="h-5 w-5" /></span>
                <h3 className="mt-4 font-semibold">{titulo}</h3>
                <p className="mt-1 text-sm text-muted">{texto}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Cómo empezar */}
        <section className="bg-navy py-20 text-white">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Empieza en minutos</h2>
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {PASOS.map((p) => (
                <li key={p.n} className="rounded-xl border border-white/10 bg-white/5 p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pato text-sm font-bold text-navy">{p.n}</span>
                  <h3 className="mt-4 text-lg font-semibold">{p.titulo}</h3>
                  <p className="mt-1 text-sm text-slate-300">{p.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Por qué */}
        <section className="mx-auto max-w-6xl px-4 py-20 md:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { i: TrendingUp, t: "Hecho para México", x: "Pesos y dólares, IVA, CFDI, conciliación con tu banco y nómina con asistencia." },
              { i: ShieldCheck, t: "Tu información, solo tuya", x: "Cada empresa ve únicamente sus datos; el aislamiento está en la base de datos." },
              { i: Smartphone, t: "En tu bolsillo", x: "Reservas, asistencia, horarios y traslados desde el celular, sin instalar nada." },
            ].map(({ i: I, t, x }) => (
              <div key={t}>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-pato"><I className="h-5 w-5" /></span>
                <h3 className="mt-4 text-lg font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{x}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Planes */}
        <section id="planes" className="scroll-mt-20 border-y border-line bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand">Planes</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Elige el que crece contigo</h2>
              <p className="mt-4 text-muted">Todos empiezan con {DIAS_PRUEBA} días de prueba gratis. Precios mensuales en pesos mexicanos, más IVA.</p>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {planes.map(({ id, def, d }) => {
                const destacado = id === "GESTION";
                return (
                  <div key={id} className={`relative flex flex-col rounded-2xl border bg-background p-6 ${destacado ? "border-brand shadow-lg ring-1 ring-brand" : "border-line"}`}>
                    {destacado && <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-brand-fg">El más elegido</span>}
                    <h3 className="text-xl font-semibold">{def.nombre}</h3>
                    <p className="mt-1 text-sm text-muted">{def.resumen}</p>
                    <p className="mt-5"><span className="text-4xl font-semibold tracking-tight">{dinero(d.precioCentavos, "MXN")}</span> <span className="text-sm text-muted">MXN / mes + IVA</span></p>
                    <p className="mt-1 text-xs text-muted">Con el cargo por servicio de pago ({TASA_CARGO * 100} %) y el IVA ({TASA_IVA_SUSCRIPCION * 100} %): <strong className="text-foreground">{dinero(d.totalCentavos, "MXN")}</strong> al mes.</p>
                    <Link href="/registro" className={`${boton} mt-6 ${destacado ? "bg-brand text-brand-fg hover:opacity-90" : "border border-line hover:bg-brand-soft"}`}>Probar {DIAS_PRUEBA} días gratis</Link>
                    {def.incluye && <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Todo lo de {PLANES[def.incluye].nombre}, más:</p>}
                    <ul className={`space-y-2.5 text-sm ${def.incluye ? "mt-3" : "mt-6"}`}>
                      {def.caracteristicas.map((c) => <li key={c.etiqueta} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{c.etiqueta}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Preguntas */}
        <section id="preguntas" className="scroll-mt-20 mx-auto max-w-3xl px-4 py-20 md:px-8">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">Preguntas frecuentes</h2>
          <div className="mt-10 divide-y divide-line rounded-xl border border-line bg-surface">
            {PREGUNTAS.map(({ p, r }) => (
              <details key={p} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {p}<span aria-hidden className="text-xl text-brand transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-muted">{r}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Cierre */}
        <section className="bg-navy bg-[radial-gradient(60%_80%_at_50%_100%,rgba(0,183,189,0.25),transparent)] py-20 text-center text-white">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Pon tu flota en orden esta semana</h2>
            <p className="mt-4 text-slate-300">Crea tu cuenta, da de alta tus embarcaciones y toma tu primera reserva hoy.</p>
            <Link href="/registro" className={`${boton} mt-8 bg-pato text-navy hover:bg-[#2dd4db]`}>Probar {DIAS_PRUEBA} días gratis</Link>
          </div>
        </section>
      </main>

      <footer className="bg-navy py-10 text-slate-400" style={SOBRE_NAVY}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm md:flex-row md:px-8">
          <LogoMarca className="h-auto w-20" titulo="FleetNautic" />
          <nav aria-label="Pie" className="flex gap-6">
            <Link href="/login" className="hover:text-white">Iniciar sesión</Link>
            <Link href="/registro" className="hover:text-white">Crear cuenta</Link>
          </nav>
          <p>© {new Date().getFullYear()} FleetNautic</p>
        </div>
      </footer>
    </div>
  );
}
