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
  | "horarios" | "inventario" | "transporte" | "facturacion" | "conciliacion" | "reportes";

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
  inventario: { id: "inventario", nombre: "Inventario", descripcion: "Existencias, compras y salidas de insumos.", requiere: [], proximamente: true, nav: [] },
  transporte: { id: "transporte", nombre: "Transporte", descripcion: "Traslados de clientes, unidades y choferes.", requiere: [], proximamente: true, nav: [] },
  facturacion: { id: "facturacion", nombre: "Facturación", descripcion: "Facturas recibidas de proveedores y emitidas a clientes (CFDI).", requiere: [], proximamente: true, nav: [] },
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
  calendario: {
    id: "calendario",
    nombre: "Calendario",
    descripcion: "Vista mensual y diaria de la operación por embarcación.",
    requiere: ["flota", "reservas"],
    nav: [{ href: "/calendario", etiqueta: "Calendario" }],
  },
};

export const ORDEN_NAV: ModuloId[] = ["nucleo", "calendario", "horarios", "reservas", "ingresos", "gastos", "cuentas", "conciliacion", "reportes", "tripulacion", "comisiones", "asistencia", "nomina", "flota"];

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
export function modulosEfectivos(plan: Plan, guardados: string[], estadoSuscripcion?: "NINGUNA" | "ACTIVA" | "PAGO_PENDIENTE" | "CANCELADA"): ModuloId[] {
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

export function navDe(activos: ModuloId[], rol?: RolUsuario) {
  return ORDEN_NAV.filter((m) => activos.includes(m))
    .flatMap((m) => MODULOS[m].nav)
    .filter((n) => !n.permiso || (rol && puede(rol, n.permiso)));
}
