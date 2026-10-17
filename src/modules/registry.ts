import type { Plan, RolUsuario } from "@prisma/client";
import { puede, type Permiso } from "./permisos";

/**
 * Registro de módulos del SaaS. Cada módulo declara su navegación y a qué
 * planes pertenece. Para agregar un vertical nuevo (nómina, comisiones,
 * finanzas…) se registra aquí, se crea su carpeta en src/app/(app)/<ruta> y
 * se protege con `requireModulo("<id>")`.
 */
export type ModuloId = "nucleo" | "flota" | "reservas" | "calendario" | "tripulacion" | "comisiones" | "nomina" | "asistencia" | "cuentas" | "gastos" | "ingresos";

export type ModuloDef = {
  id: ModuloId;
  nombre: string;
  descripcion: string;
  /** Módulos que deben estar activos para que este funcione. */
  requiere: ModuloId[];
  /** Se activa solo cuando lo necesita otro módulo; no se ofrece ni se apaga a mano. */
  implicito?: boolean;
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
    nombre: "Tripulación",
    descripcion: "Capitanes, marineros y guías, y su asignación a cada reserva.",
    requiere: ["flota", "reservas"],
    nav: [{ href: "/tripulacion", etiqueta: "Tripulación" }],
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
  calendario: {
    id: "calendario",
    nombre: "Calendario",
    descripcion: "Vista mensual y diaria de la operación por embarcación.",
    requiere: ["flota", "reservas"],
    nav: [{ href: "/calendario", etiqueta: "Calendario" }],
  },
};

export const ORDEN_NAV: ModuloId[] = ["nucleo", "calendario", "reservas", "ingresos", "gastos", "cuentas", "tripulacion", "comisiones", "asistencia", "nomina", "flota"];

export const MODULOS_POR_PLAN: Record<Plan, ModuloId[]> = {
  PRUEBA: ["nucleo", "flota", "reservas", "calendario", "tripulacion", "comisiones", "nomina", "asistencia", "gastos", "ingresos"],
  BASICO: ["nucleo", "flota", "reservas"],
  PRO: ["nucleo", "flota", "reservas", "calendario", "tripulacion", "comisiones", "nomina", "asistencia", "gastos", "ingresos"],
};

const IDS = new Set<string>(Object.keys(MODULOS));

/** Normaliza lo guardado en BD: solo ids válidos, siempre con núcleo, y
 *  descartando los que les falte una dependencia. */
export function modulosActivos(guardados: string[]): ModuloId[] {
  const set = new Set<ModuloId>(["nucleo"]);
  for (const g of guardados) if (IDS.has(g)) set.add(g as ModuloId);
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
