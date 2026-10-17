import type { Plan, RolUsuario } from "@prisma/client";
import { puede, type Permiso } from "./permisos";

/**
 * Registro de módulos del SaaS. Cada módulo declara su navegación y a qué
 * planes pertenece. Para agregar un vertical nuevo (nómina, comisiones,
 * finanzas…) se registra aquí, se crea su carpeta en src/app/(app)/<ruta> y
 * se protege con `requireModulo("<id>")`.
 */
export type ModuloId = "nucleo" | "flota" | "reservas" | "calendario" | "tripulacion" | "comisiones";

export type ModuloDef = {
  id: ModuloId;
  nombre: string;
  descripcion: string;
  /** Módulos que deben estar activos para que este funcione. */
  requiere: ModuloId[];
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
  calendario: {
    id: "calendario",
    nombre: "Calendario",
    descripcion: "Vista mensual y diaria de la operación por embarcación.",
    requiere: ["flota", "reservas"],
    nav: [{ href: "/calendario", etiqueta: "Calendario" }],
  },
};

export const ORDEN_NAV: ModuloId[] = ["nucleo", "calendario", "reservas", "tripulacion", "comisiones", "flota"];

export const MODULOS_POR_PLAN: Record<Plan, ModuloId[]> = {
  PRUEBA: ["nucleo", "flota", "reservas", "calendario", "tripulacion", "comisiones"],
  BASICO: ["nucleo", "flota", "reservas"],
  PRO: ["nucleo", "flota", "reservas", "calendario", "tripulacion", "comisiones"],
};

const IDS = new Set<string>(Object.keys(MODULOS));

/** Normaliza lo guardado en BD: solo ids válidos, siempre con núcleo, y
 *  descartando los que les falte una dependencia. */
export function modulosActivos(guardados: string[]): ModuloId[] {
  const set = new Set<ModuloId>(["nucleo"]);
  for (const g of guardados) if (IDS.has(g)) set.add(g as ModuloId);
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
  return [...set];
}

export function navDe(activos: ModuloId[], rol?: RolUsuario) {
  return ORDEN_NAV.filter((m) => activos.includes(m))
    .flatMap((m) => MODULOS[m].nav)
    .filter((n) => !n.permiso || (rol && puede(rol, n.permiso)));
}
