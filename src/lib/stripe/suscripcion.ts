// Cobro de la suscripción (puro, sin red ni BD): cómo se traduce lo que dice Stripe a plan y acceso.
import type { EstadoSuscripcion, Plan } from "@prisma/client";

/** Los precios en Stripe se identifican por su `lookup_key`, no por IDs: así el código no depende
 *  de variables de entorno con IDs distintos en cada cuenta. El script de configuración los crea. */
export const LOOKUP_KEYS = {
  CONTROL: "fleetnautic_control_mensual",
  GESTION: "fleetnautic_gestion_mensual",
  ENTERPRISE: "fleetnautic_enterprise_mensual",
} as const satisfies Record<Exclude<Plan, "PRUEBA">, string>;

/** El cargo por servicio de pago es un segundo concepto mensual de la suscripción, con su propio precio por plan. */
export const LOOKUP_KEYS_CARGO = {
  CONTROL: "fleetnautic_control_cargo",
  GESTION: "fleetnautic_gestion_cargo",
  ENTERPRISE: "fleetnautic_enterprise_cargo",
} as const satisfies Record<Exclude<Plan, "PRUEBA">, string>;

export type PlanPago = keyof typeof LOOKUP_KEYS;
export const esPlanPago = (p: string): p is PlanPago => p in LOOKUP_KEYS;
export const lookupKeyDe = (plan: PlanPago) => LOOKUP_KEYS[plan];

export function planDeLookupKey(key: string | null | undefined): PlanPago | null {
  const hallado = (Object.entries(LOOKUP_KEYS) as [PlanPago, string][]).find(([, k]) => k === key);
  return hallado ? hallado[0] : null;
}

/** Estado de Stripe → estado en el ERP. IGNORAR = todavía no se sabe (p. ej. el pago aún no se completa). */
export function estadoDeStripe(status: string): EstadoSuscripcion | "IGNORAR" {
  switch (status) {
    case "active": case "trialing": return "ACTIVA";
    case "past_due": return "PAGO_PENDIENTE"; // Stripe sigue reintentando el cobro
    case "canceled": case "unpaid": case "incomplete_expired": case "paused": return "CANCELADA";
    default: return "IGNORAR"; // incomplete, etc.
  }
}

/** Lo mínimo que se necesita de una suscripción de Stripe. */
export type SuscripcionMin = {
  id: string;
  customerId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  /** Fin del periodo pagado, en segundos Unix (Stripe lo da en cada item de la suscripción). */
  periodoFin: number | null;
  lookupKey: string | null;
  tenantId: string | null;
};

export type Resumen = { estado: EstadoSuscripcion; plan: PlanPago | null; venceEn: Date | null; cancelaAlFinal: boolean };

/** null si el estado aún no es concluyente (no se toca nada). */
export function resumirSuscripcion(s: SuscripcionMin): Resumen | null {
  const estado = estadoDeStripe(s.status);
  if (estado === "IGNORAR") return null;
  return { estado, plan: planDeLookupKey(s.lookupKey), venceEn: s.periodoFin ? new Date(s.periodoFin * 1000) : null, cancelaAlFinal: s.cancelAtPeriodEnd };
}

export type EstadoEmpresa = { stripeSubscriptionId: string | null; estadoSuscripcion: EstadoSuscripcion; plan: Plan };

/** ¿Debe esta suscripción modificar a la empresa? Evita que el cierre de una suscripción VIEJA
 *  (p. ej. al cambiar de suscripción) deje sin acceso a quien ya tiene otra activa. */
export function aplicaALaEmpresa(e: EstadoEmpresa, subId: string, nuevo: EstadoSuscripcion): boolean {
  const viva = e.estadoSuscripcion === "ACTIVA" || e.estadoSuscripcion === "PAGO_PENDIENTE";
  if (e.stripeSubscriptionId && e.stripeSubscriptionId !== subId && viva && nuevo === "CANCELADA") return false;
  return true;
}

/** Cargo por servicio de pago (4 % del precio del plan) e IVA (16 % sobre el precio y el cargo), como cobra Procura. */
export const TASA_CARGO = 0.04;
export const TASA_IVA_SUSCRIPCION = 0.16;

/** Lo que paga una empresa al mes por un plan de `precioMxn` pesos: precio + cargo + IVA, en centavos enteros. */
export function desglosePlan(precioMxn: number) {
  const precio = Math.round(precioMxn * 100);
  const cargo = Math.round(precio * TASA_CARGO);
  const iva = Math.round((precio + cargo) * TASA_IVA_SUSCRIPCION);
  return { precioCentavos: precio, cargoCentavos: cargo, ivaCentavos: iva, totalCentavos: precio + cargo + iva };
}

/** Orden de los planes de pago, de menor a mayor. */
export const ORDEN_PLANES: PlanPago[] = ["CONTROL", "GESTION", "ENTERPRISE"];
/** ¿Pasar de `actual` a `nuevo` sube de plan? */
export const esMejora = (actual: PlanPago, nuevo: PlanPago) => ORDEN_PLANES.indexOf(nuevo) > ORDEN_PLANES.indexOf(actual);
