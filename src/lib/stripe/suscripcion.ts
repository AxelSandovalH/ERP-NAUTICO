// Cobro de la suscripción (puro, sin red ni BD): cómo se traduce lo que dice Stripe a plan y acceso.
import type { EstadoSuscripcion, Plan } from "@prisma/client";

/** Los precios en Stripe se identifican por su `lookup_key`, no por IDs: así el código no depende
 *  de variables de entorno con IDs distintos en cada cuenta. El script de configuración los crea. */
export const LOOKUP_KEYS = {
  CONTROL: "fleetnautic_control_mensual",
  GESTION: "fleetnautic_gestion_mensual",
  ENTERPRISE: "fleetnautic_enterprise_mensual",
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
