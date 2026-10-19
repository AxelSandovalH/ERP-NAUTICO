import type Stripe from "stripe";
import { MODULOS, MODULOS_POR_PLAN, esConstruido } from "@/modules/registry";
import { asegurarPrecioCargo, asegurarPrecioPlan, asegurarTasaIva } from "./catalogo";
import { LOOKUP_KEYS_CARGO, esMejora, planDeLookupKey, type PlanPago } from "./suscripcion";

export class ErrorCambioPlan extends Error {}

/** Nombres de los módulos que se dejan de tener al pasar de un plan a otro (solo los ya construidos; el núcleo siempre queda). */
export function modulosQueSePierden(actual: PlanPago, nuevo: PlanPago): string[] {
  const queda = new Set<string>(MODULOS_POR_PLAN[nuevo]);
  return MODULOS_POR_PLAN[actual].filter((m) => !queda.has(m) && m !== "nucleo" && esConstruido(m) && !MODULOS[m].implicito).map((m) => MODULOS[m].nombre);
}

/**
 * Cambia el plan de una suscripción activa. La suscripción lleva dos renglones (el plan y su cargo por servicio de pago), y los dos cambian juntos.
 * - Subir de plan: se aplica ya y se cobra de inmediato la diferencia proporcional del periodo; si el cobro falla, NO cambia nada.
 * - Bajar de plan: se aplica ya y la diferencia proporcional queda como saldo a favor en la siguiente factura.
 */
export async function cambiarPlanEnStripe(stripe: Stripe, subscriptionId: string, nuevo: PlanPago): Promise<Stripe.Subscription> {
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  if (sub.status !== "active") throw new ErrorCambioPlan("Tu suscripción no está activa. Si hay un pago pendiente, actualiza tu método de pago primero.");
  if (sub.cancel_at_period_end) throw new ErrorCambioPlan("Tu suscripción está programada para cancelarse. Reactívala desde «Administrar suscripción» antes de cambiar de plan.");
  const itemPlan = sub.items.data.find((i) => planDeLookupKey(i.price?.lookup_key));
  if (!itemPlan) throw new ErrorCambioPlan("No se reconoce el plan de tu suscripción. Avisa a soporte.");
  const actual = planDeLookupKey(itemPlan.price.lookup_key)!;
  if (actual === nuevo) throw new ErrorCambioPlan("Ya estás en ese plan.");

  const precio = await asegurarPrecioPlan(stripe, nuevo), cargo = await asegurarPrecioCargo(stripe, nuevo), iva = await asegurarTasaIva(stripe);
  const itemCargo = sub.items.data.find((i) => (Object.values(LOOKUP_KEYS_CARGO) as string[]).includes(i.price?.lookup_key ?? ""));
  return stripe.subscriptions.update(
    subscriptionId,
    {
      items: [
        { id: itemPlan.id, price: precio.id, tax_rates: [iva.id] },
        // Una suscripción anterior al cargo no tiene ese renglón: se agrega
        itemCargo ? { id: itemCargo.id, price: cargo.id, tax_rates: [iva.id] } : { price: cargo.id, tax_rates: [iva.id] },
      ],
      proration_behavior: esMejora(actual, nuevo) ? "always_invoice" : "create_prorations",
      payment_behavior: "error_if_incomplete",
      metadata: { ...sub.metadata, plan: nuevo },
    },
    // El mismo cambio repetido en un par de minutos (doble clic) no se cobra dos veces; uno posterior sí es un cambio nuevo
    { idempotencyKey: `cambio-${subscriptionId}-${actual}-${nuevo}-${Math.floor(Date.now() / 120_000)}` },
  );
}
