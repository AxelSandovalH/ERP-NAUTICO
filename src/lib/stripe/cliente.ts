import "server-only";
import Stripe from "stripe";

let cliente: Stripe | null = null;

export const stripeConfigurado = () => !!process.env.STRIPE_SECRET_KEY;

/** Cliente perezoso: sin STRIPE_SECRET_KEY el resto de la app funciona y solo se oculta el cobro. */
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY no configurada");
  return (cliente ??= new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20_000 }));
}
