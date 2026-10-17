import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { aplicaALaEmpresa, resumirSuscripcion, type SuscripcionMin } from "./suscripcion";

type Db = Pick<PrismaClient, "tenant">;

/** De un objeto Subscription de Stripe a lo mínimo que usamos. */
export function aSuscripcionMin(s: Stripe.Subscription): SuscripcionMin {
  const item = s.items.data[0];
  return {
    id: s.id,
    customerId: typeof s.customer === "string" ? s.customer : s.customer.id,
    status: s.status,
    cancelAtPeriodEnd: s.cancel_at_period_end,
    periodoFin: item?.current_period_end ?? null,
    lookupKey: item?.price?.lookup_key ?? null,
    tenantId: s.metadata?.tenantId ?? null,
  };
}

/** Refleja el estado de una suscripción de Stripe en la empresa. Siempre se parte de la suscripción
 *  ACTUAL (se vuelve a pedir a Stripe), así que el orden o la repetición de los eventos no importa. */
export async function sincronizarSuscripcion(db: Db, s: SuscripcionMin): Promise<"actualizada" | "ignorada" | "sin_empresa"> {
  const r = resumirSuscripcion(s);
  if (!r) return "ignorada";
  const tenant = (s.tenantId ? await db.tenant.findUnique({ where: { id: s.tenantId } }) : null) ?? (await db.tenant.findUnique({ where: { stripeCustomerId: s.customerId } }));
  if (!tenant) return "sin_empresa";
  if (!aplicaALaEmpresa(tenant, s.id, r.estado)) return "ignorada";
  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      stripeCustomerId: tenant.stripeCustomerId ?? s.customerId,
      stripeSubscriptionId: s.id,
      estadoSuscripcion: r.estado,
      suscripcionVenceEn: r.venceEn,
      cancelaAlFinal: r.cancelaAlFinal,
      // El plan lo marca el precio contratado. Si se cancela se conserva (solo informativo): el acceso lo corta el estado.
      ...(r.plan && r.estado !== "CANCELADA" ? { plan: r.plan } : {}),
    },
  });
  return "actualizada";
}

export type Dependencias = { db: Db; obtenerSuscripcion: (id: string) => Promise<SuscripcionMin | null> };

const idDe = (v: unknown): string | null => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? String((v as { id: unknown }).id) : null);

/** Procesa un evento de Stripe ya verificado. Devuelve qué hizo (para el registro). */
export async function procesarEventoStripe(event: Stripe.Event, d: Dependencias): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed": {
      const sesion = event.data.object as Stripe.Checkout.Session;
      const subId = idDe(sesion.subscription);
      if (sesion.mode !== "subscription" || !subId) return "ignorado: no es una suscripción";
      const sub = await d.obtenerSuscripcion(subId);
      if (!sub) return "ignorado: suscripción no encontrada";
      // La sesión sabe de qué empresa es aunque la suscripción aún no lo diga
      return `checkout: ${await sincronizarSuscripcion(d.db, { ...sub, tenantId: sub.tenantId ?? sesion.client_reference_id ?? sesion.metadata?.tenantId ?? null })}`;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const objeto = event.data.object as Stripe.Subscription;
      const sub = (await d.obtenerSuscripcion(objeto.id)) ?? aSuscripcionMin(objeto);
      return `suscripción: ${await sincronizarSuscripcion(d.db, sub)}`;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const factura = event.data.object as Stripe.Invoice & { subscription?: unknown };
      // Según la versión de la API, la suscripción cuelga de la factura directamente o de `parent`
      const subId = idDe(factura.parent?.subscription_details?.subscription) ?? idDe(factura.subscription);
      if (!subId) return "ignorado: factura sin suscripción";
      const sub = await d.obtenerSuscripcion(subId);
      return sub ? `factura: ${await sincronizarSuscripcion(d.db, sub)}` : "ignorado: suscripción no encontrada";
    }
    default:
      return `ignorado: ${event.type}`;
  }
}
