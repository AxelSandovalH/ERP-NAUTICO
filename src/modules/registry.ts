import type { Plan, RolUsuario } from "@prisma/client";
import { puede, type Permiso } from "./permisos";

/**
 * Registro de módulos del SaaS. Cada módulo declara su navegación y a qué
 * planes pertenece. Para agregar un vertical nuevo (nómina, comisiones,
 * finanzas…) se registra aquí, se crea su carpeta en src/app/(app)/<ruta> y
 * se protege con `requireModulo("<id>")`.
 */
export type ModuloId =
  | "nucleo" | "flota" | "reservas" | "calendario" | "tripulacion" | "comisiones" | "nomina" | "asistencia" | "cuentas" | "gastos" | "ingresos"
  // Ya forman parte de los planes, pero aún no están construidos (proximamente: true)
  | "horarios" | "inventario" | "transporte" | "facturacion" | "conciliacion" | "reportes" | "actividades";

export type ModuloDef = {
  id: ModuloId;
  nombre: string;
  descripcion: string;
  /** Módulos que deben estar activos para que este funcione. */
  requiere: ModuloId[];
  /** Se activa solo cuando lo necesita otro módulo; no se ofrece ni se apaga a mano. */
  implicito?: boolean;
  /** Aparece en los planes pero todavía no existe: no se activa ni muestra enlaces. */
  proximamente?: boolean;
  nav: { href: string; etiqueta: string; permiso?: Permiso }[];
};

export const MODULOS: Record<ModuloId, ModuloDef> = {
  nucleo: {
    id: "nucleo",
    nombre: "Núcleo",
    descripcion: "Panel, usuarios y configuración. Siempre activo.",
    requiere: [],
    nav: [
      { href: "/dashboard", etiqueta: "Panel" },
      { href: "/configuracion", etiqueta: "Configuración", permiso: "usuarios:administrar" },
    ],
  },
  flota: {
    id: "flota",
    nombre: "Flota",
    descripcion: "Embarcaciones, tarifas y bloqueos de disponibilidad.",
    requiere: [],
    nav: [{ href: "/flota", etiqueta: "Flota" }],
  },
  reservas: {
    id: "reservas",
    nombre: "Reservas y clientes",
    descripcion: "Reservas, clientes y pagos.",
    requiere: ["flota"],
    nav: [
      { href: "/reservas", etiqueta: "Reservas" },
      { href: "/clientes", etiqueta: "Clientes" },
    ],
  },
  tripulacion: {
    id: "tripulacion",
    nombre: "Equipo",
    descripcion: "Capitanes, marineros y guías, y su asignación a cada reserva.",
    requiere: ["flota", "reservas"],
    nav: [{ href: "/tripulacion", etiqueta: "Equipo" }],
  },
  comisiones: {
    id: "comisiones",
    nombre: "Comisiones",
    descripcion: "Tarifas por vendedor, agencia o concierge, abonos y cierre de periodo.",
    requiere: ["flota", "reservas"],
    nav: [{ href: "/comisiones", etiqueta: "Comisiones", permiso: "comisiones:ver_propias" }],
  },
  nomina: {
    id: "nomina",
    nombre: "Nómina",
    descripcion: "Empleados, pagos por periodo, bonos y deducciones.",
    requiere: [],
    nav: [{ href: "/nomina", etiqueta: "Nómina", permiso: "nomina:administrar" }],
  },
  asistencia: {
    id: "asistencia",
    nombre: "Asistencia",
    descripcion: "Checada por geolocalización y corrección de días; alimenta la nómina.",
    requiere: ["nomina"],
    nav: [{ href: "/asistencia", etiqueta: "Asistencia", permiso: "asistencia:checar" }],
  },
  cuentas: {
    id: "cuentas",
    nombre: "Cuentas y caja",
    descripcion: "Efectivo, bancos, tarjetas y pasarelas: saldos, traspasos y arqueo. Se activa con Gastos o Ingresos.",
    requiere: [],
    implicito: true,
    nav: [{ href: "/cuentas", etiqueta: "Cuentas", permiso: "cuentas:administrar" }],
  },
  gastos: {
    id: "gastos",
    nombre: "Gastos",
    descripcion: "Registro de gastos por categoría, cuenta y embarcación, en pesos o dólares, con comprobantes.",
    requiere: ["cuentas"],
    nav: [{ href: "/gastos", etiqueta: "Gastos", permiso: "gastos:registrar" }],
  },
  ingresos: {
    id: "ingresos",
    nombre: "Ingresos",
    descripcion: "Ingresos de reservas y otros, por cuenta y moneda; se generan solos al cobrar una reserva.",
    requiere: ["cuentas", "reservas"],
    nav: [{ href: "/ingresos", etiqueta: "Ingresos", permiso: "ingresos:ver" }],
  },
  horarios: {
    id: "horarios",
    nombre: "Horarios",
    descripcion: "Planeación semanal de turnos, descansos y ausencias del equipo, con publicación para cada persona.",
    requiere: [],
    nav: [
      { href: "/horarios", etiqueta: "Horarios", permiso: "horarios:administrar" },
      { href: "/horarios/mio", etiqueta: "Mi horario", permiso: "horarios:ver_propio" },
    ],
  },
  inventario: {
    id: "inventario",
    nombre: "Inventario",
    descripcion: "Insumos por almacén y embarcación: compras (con su gasto), consumo, mermas, traspasos, conteo físico y alertas de existencia mínima.",
    requiere: ["gastos"],
    nav: [{ href: "/inventario", etiqueta: "Inventario", permiso: "inventario:ver" }],
  },
  transporte: {
    id: "transporte",
    nombre: "Transporte",
    descripcion: "Traslados de clientes ligados a reservas, con unidades y choferes del equipo, cobro, gastos y vista del día para el chofer.",
    requiere: ["reservas"],
    nav: [
      { href: "/transporte", etiqueta: "Transporte", permiso: "transporte:ver" },
      { href: "/transporte/mios", etiqueta: "Mis traslados", permiso: "transporte:ver_propio" },
    ],
  },
  facturacion: {
    id: "facturacion",
    nombre: "Facturación",
    descripcion: "CFDI de reservas y traslados cobrados, timbrados con Procura: datos fiscales del cliente, estado, XML, PDF y cancelación.",
    requiere: ["reservas"],
    nav: [{ href: "/facturacion", etiqueta: "Facturación", permiso: "facturacion:ver" }],
  },
  conciliacion: {
    id: "conciliacion",
    nombre: "Conciliación bancaria",
    descripcion: "Cuadre de tus cuentas contra los estados de cuenta del banco, con cierre mensual.",
    requiere: ["cuentas"],
    nav: [{ href: "/conciliacion", etiqueta: "Conciliación", permiso: "conciliacion:administrar" }],
  },
  reportes: {
    id: "reportes",
    nombre: "Gráficas, dashboard y reportes",
    descripcion: "Indicadores, gráficas y reportes de ventas, ingresos, gastos y rentabilidad por embarcación.",
    requiere: [],
    nav: [{ href: "/reportes", etiqueta: "Reportes", permiso: "reportes:ver" }],
  },
  actividades: {
    id: "actividades",
    nombre: "Actividades",
    descripcion: "Experiencias que se venden por persona: catálogo con fotos y precios, salidas con cupo, reservas, cobros y, si usan una embarcación, la bloquean en el calendario.",
    requiere: ["reservas"],
    nav: [{ href: "/actividades", etiqueta: "Actividades", permiso: "actividades:ver" }],
  },
  calendario: {
    id: "calendario",
    nombre: "Calendario",
    descripcion: "Vista mensual y diaria de la operación por embarcación.",
    requiere: ["flota", "reservas"],
    nav: [{ href: "/calendario", etiqueta: "Calendario" }],
  },
};

export const ORDEN_NAV: ModuloId[] = ["nucleo", "calendario", "horarios", "inventario", "transporte", "facturacion", "reservas", "ingresos", "gastos", "cuentas", "conciliacion", "reportes", "tripulacion", "comisiones", "asistencia", "nomina", "flota", "actividades"];

/** Lo que incluye cada plan, en el orden y con los nombres con que se vende. Cada plan incluye todo lo
 *  anterior. Una característica puede cubrir varios módulos (p. ej. el calendario necesita las reservas). */
export type Caracteristica = { etiqueta: string; modulos: ModuloId[] };
export type PlanDef = { nombre: string; precioMxnMensual: number | null; resumen: string; incluye?: Plan; caracteristicas: Caracteristica[] };

export const PLANES: Record<Plan, PlanDef> = {
  PRUEBA: { nombre: "Prueba", precioMxnMensual: null, resumen: "Todo lo disponible, para conocer el sistema.", caracteristicas: [] },
  CONTROL: {
    nombre: "Control", precioMxnMensual: 6000, resumen: "Para organizar la operación básica.",
    caracteristicas: [
      { etiqueta: "Calendario operativo", modulos: ["calendario", "reservas"] },
      { etiqueta: "Horarios", modulos: ["horarios"] },
      { etiqueta: "Ingresos", modulos: ["ingresos"] },
      { etiqueta: "Gastos", modulos: ["gastos"] },
      { etiqueta: "Flota", modulos: ["flota"] },
    ],
  },
  GESTION: {
    nombre: "Gestión", precioMxnMensual: 10000, resumen: "Para gestionar la operación y sus recursos.", incluye: "CONTROL",
    caracteristicas: [
      { etiqueta: "Inventario", modulos: ["inventario"] },
      { etiqueta: "Equipo", modulos: ["tripulacion"] },
      { etiqueta: "Transporte", modulos: ["transporte"] },
      { etiqueta: "Actividades y experiencias", modulos: ["actividades"] },
      { etiqueta: "Facturación", modulos: ["facturacion"] },
    ],
  },
  ENTERPRISE: {
    nombre: "Enterprise", precioMxnMensual: 15000, resumen: "Para integrar la gestión administrativa, financiera y operativa.", incluye: "GESTION",
    caracteristicas: [
      { etiqueta: "Conciliación bancaria", modulos: ["conciliacion"] },
      { etiqueta: "Asistencia + nómina", modulos: ["asistencia", "nomina"] },
      { etiqueta: "Comisiones", modulos: ["comisiones"] },
      { etiqueta: "Gráficas, dashboard y reportes", modulos: ["reportes"] },
    ],
  },
};

/** Planes de pago, de menor a mayor. */
export const PLANES_DE_PAGO: Plan[] = ["CONTROL", "GESTION", "ENTERPRISE"];

/** Todas las características de un plan, incluyendo las de los planes que incluye. */
export function caracteristicasDe(plan: Plan): Caracteristica[] {
  if (plan === "PRUEBA") return PLANES_DE_PAGO.flatMap((p) => PLANES[p].caracteristicas);
  const def = PLANES[plan];
  return [...(def.incluye ? caracteristicasDe(def.incluye) : []), ...def.caracteristicas];
}

/** Módulos que habilita cada plan (núcleo siempre; incluye los "próximamente", que se activan al construirse). */
export const MODULOS_POR_PLAN = Object.fromEntries(
  (Object.keys(PLANES) as Plan[]).map((p) => [p, ["nucleo", ...new Set(caracteristicasDe(p).flatMap((c) => c.modulos))] as ModuloId[]]),
) as Record<Plan, ModuloId[]>;

/** Un módulo "próximamente" no se activa aunque el plan lo incluya. */
export const esConstruido = (id: ModuloId) => !MODULOS[id].proximamente;

/** Lo que de verdad ve una empresa: lo que su plan permite ∩ lo que tiene activado, ya con dependencias,
 *  y sin nada más que el núcleo si su suscripción terminó. */
export function modulosEfectivos(plan: Plan, guardados: string[], estadoSuscripcion?: "NINGUNA" | "ACTIVA" | "PAGO_PENDIENTE" | "CANCELADA", pruebaVencida = false): ModuloId[] {
  // La prueba de 7 días terminó y no contrató: solo queda el núcleo (panel y configuración) para elegir un plan
  if (pruebaVencida) return ["nucleo"];
  // Suscripción terminada o sin poder cobrarse: solo queda el núcleo (panel y configuración) para reactivarla.
  // PAGO_PENDIENTE conserva todo: Stripe reintenta el cobro y se avisa con un banner.
  if (estadoSuscripcion === "CANCELADA") return ["nucleo"];
  const permitidos = new Set<string>(MODULOS_POR_PLAN[plan]);
  return modulosActivos(guardados.filter((m) => permitidos.has(m)));
}

const IDS = new Set<string>(Object.keys(MODULOS));

/** Normaliza lo guardado en BD: solo ids válidos, siempre con núcleo, y
 *  descartando los que les falte una dependencia. */
export function modulosActivos(guardados: string[]): ModuloId[] {
  const set = new Set<ModuloId>(["nucleo"]);
  for (const g of guardados) if (IDS.has(g) && esConstruido(g as ModuloId)) set.add(g as ModuloId);
  // Cuentas y caja acompaña a Gastos e Ingresos: no se compra ni se apaga por separado
  if (set.has("gastos") || set.has("ingresos")) set.add("cuentas");
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const id of [...set]) {
      if (MODULOS[id].requiere.some((r) => !set.has(r))) {
        set.delete(id);
        cambio = true;
      }
    }
  }
  // Si Gastos e Ingresos quedaron fuera, Cuentas no tiene razón de ser
  if (!set.has("gastos") && !set.has("ingresos")) set.delete("cuentas");
  return [...set];
}

// ─── barra de navegación ─────────────────────────────────────────────────────

/** Una página dentro de una sección de la barra. La primera entrada es la principal; las demás se muestran como pestañas. */
export type Entrada = { href: string; etiqueta: string; modulo: ModuloId; permiso?: Permiso; /** Otro módulo que también debe estar activo (p. ej. los reportes de gastos necesitan Reportes y Gastos) */ ademas?: ModuloId };
/** `etiquetaFija`: la sección siempre se llama igual (no toma el nombre de su primera entrada visible). */
export type SeccionDef = { id: string; etiqueta: string; entradas: Entrada[]; etiquetaFija?: boolean };

/** Orden de la barra lateral, en tres grupos separados. Lo que no es un módulo propio vive como pestaña dentro de otra sección:
 *  Reservas y Clientes en Calendario; Equipo, Asistencia y Horarios en Nómina; Cuentas en Conciliación; Inventario en Flota. */
export const GRUPOS_NAV: SeccionDef[][] = [
  [
    { id: "flota", etiqueta: "Flota", entradas: [
      { href: "/flota", etiqueta: "Embarcaciones", modulo: "flota" },
      { href: "/inventario", etiqueta: "Inventario", modulo: "inventario", permiso: "inventario:ver" },
    ] },
    { id: "transporte", etiqueta: "Transporte", entradas: [
      { href: "/transporte", etiqueta: "Traslados", modulo: "transporte", permiso: "transporte:ver" },
      { href: "/transporte/unidades", etiqueta: "Flota terrestre", modulo: "transporte", permiso: "transporte:ver" },
      { href: "/transporte/mios", etiqueta: "Mis traslados", modulo: "transporte", permiso: "transporte:ver_propio" },
    ] },
    { id: "calendario", etiqueta: "Calendario", entradas: [
      { href: "/calendario", etiqueta: "Calendario", modulo: "calendario" },
      { href: "/reservas", etiqueta: "Reservas", modulo: "reservas" },
      { href: "/clientes", etiqueta: "Clientes", modulo: "reservas" },
    ] },
    { id: "actividades", etiqueta: "Actividades", entradas: [
      { href: "/actividades", etiqueta: "Catálogo", modulo: "actividades", permiso: "actividades:ver" },
      { href: "/actividades/salidas", etiqueta: "Salidas", modulo: "actividades", permiso: "actividades:ver" },
    ] },
  ],
  [
    { id: "ingresos", etiqueta: "Ingresos", entradas: [{ href: "/ingresos", etiqueta: "Ingresos", modulo: "ingresos", permiso: "ingresos:ver" }] },
    { id: "gastos", etiqueta: "Gastos", entradas: [{ href: "/gastos", etiqueta: "Gastos", modulo: "gastos", permiso: "gastos:registrar" }] },
    { id: "facturacion", etiqueta: "Facturación", entradas: [{ href: "/facturacion", etiqueta: "Facturación", modulo: "facturacion", permiso: "facturacion:ver" }] },
    { id: "conciliacion", etiqueta: "Conciliación", entradas: [
      { href: "/conciliacion", etiqueta: "Conciliación", modulo: "conciliacion", permiso: "conciliacion:administrar" },
      { href: "/cuentas", etiqueta: "Cuentas", modulo: "cuentas", permiso: "cuentas:administrar" },
    ] },
    { id: "nomina", etiqueta: "Nómina", entradas: [
      { href: "/nomina", etiqueta: "Nómina", modulo: "nomina", permiso: "nomina:administrar" },
      { href: "/asistencia", etiqueta: "Asistencia", modulo: "asistencia", permiso: "asistencia:checar" },
      { href: "/tripulacion", etiqueta: "Equipo", modulo: "tripulacion" },
      { href: "/horarios", etiqueta: "Horarios", modulo: "horarios", permiso: "horarios:administrar" },
      { href: "/horarios/mio", etiqueta: "Mi horario", modulo: "horarios", permiso: "horarios:ver_propio" },
    ] },
  ],
  [
    { id: "comisiones", etiqueta: "Comisiones", entradas: [{ href: "/comisiones", etiqueta: "Comisiones", modulo: "comisiones", permiso: "comisiones:ver_propias" }] },
    { id: "tarifas", etiqueta: "Tarifas", entradas: [{ href: "/tarifas", etiqueta: "Tarifas", modulo: "flota" }] },
    { id: "reportes", etiqueta: "Reportes", etiquetaFija: true, entradas: [
      { href: "/reportes/embarcaciones", etiqueta: "Embarcaciones", modulo: "reservas", ademas: "reportes", permiso: "reportes:ver" },
      { href: "/reportes/gastos", etiqueta: "Gastos", modulo: "gastos", ademas: "reportes", permiso: "reportes:ver" },
      { href: "/reportes/ingresos", etiqueta: "Ingresos", modulo: "ingresos", ademas: "reportes", permiso: "reportes:ver" },
      { href: "/reportes/flota-terrestre", etiqueta: "Flota terrestre", modulo: "transporte", ademas: "reportes", permiso: "reportes:ver" },
    ] },
    { id: "dashboard", etiqueta: "Dashboard", entradas: [{ href: "/dashboard", etiqueta: "Dashboard", modulo: "nucleo" }] },
  ],
];

export type SeccionNav = { id: string; etiqueta: string; href: string; rutas: string[]; tabs: { href: string; etiqueta: string }[] };

const visible = (e: Entrada, activos: ModuloId[], rol?: RolUsuario) => activos.includes(e.modulo) && (!e.ademas || activos.includes(e.ademas)) && (!e.permiso || (!!rol && puede(rol, e.permiso)));

/** Barra lateral para esta empresa y este rol: grupos de secciones, ya sin lo que el plan, los módulos o el rol no permiten.
 *  Si la entrada principal no es visible, la sección toma el nombre y el destino de la primera que sí lo sea. */
export function seccionesDe(activos: ModuloId[], rol?: RolUsuario): SeccionNav[][] {
  return GRUPOS_NAV.map((grupo) => grupo.flatMap((sec) => {
    const vis = sec.entradas.filter((e) => visible(e, activos, rol));
    if (vis.length === 0) return [];
    return [{
      id: sec.id,
      etiqueta: sec.etiquetaFija || vis[0] === sec.entradas[0] ? sec.etiqueta : vis[0].etiqueta,
      href: vis[0].href,
      rutas: sec.entradas.map((e) => e.href),
      tabs: vis.map((e) => ({ href: e.href, etiqueta: e.etiqueta })),
    }];
  })).filter((g) => g.length > 0);
}

/** Todas las páginas a las que esta empresa y este rol pueden entrar desde la barra (sin repetir secciones). */
export function navDe(activos: ModuloId[], rol?: RolUsuario) {
  return seccionesDe(activos, rol).flat().flatMap((s) => s.tabs);
}
