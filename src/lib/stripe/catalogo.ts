import type Stripe from "stripe";
import { PLANES } from "@/modules/registry";
import { LOOKUP_KEYS, LOOKUP_KEYS_CARGO, TASA_IVA_SUSCRIPCION, desglosePlan, type PlanPago } from "./suscripcion";

// Productos, precios y la tasa de IVA de la suscripción. Todo se crea la primera vez que hace falta y se reutiliza después:
// los precios se identifican por `lookup_key` y las creaciones llevan llave de idempotencia (un doble clic no duplica nada).

export async function asegurarPrecioPlan(stripe: Stripe, plan: PlanPago): Promise<Stripe.Price> {
  const clave = LOOKUP_KEYS[plan];
  const existe = (await stripe.prices.list({ lookup_keys: [clave], active: true, limit: 1 })).data[0];
  if (existe) return existe;
  const def = PLANES[plan];
  const producto = await stripe.products.create({ name: `FleetNautic ${def.nombre}`, description: def.resumen, metadata: { plan } }, { idempotencyKey: `producto-${clave}` });
  return stripe.prices.create(
    { product: producto.id, currency: "mxn", unit_amount: desglosePlan(def.precioMxnMensual ?? 0).precioCentavos, recurring: { interval: "month" }, lookup_key: clave, tax_behavior: "exclusive" },
    { idempotencyKey: `precio-${clave}` },
  );
}

/** El cargo por servicio de pago: 4 % del precio del plan, como concepto aparte para que se vea en el recibo. */
export async function asegurarPrecioCargo(stripe: Stripe, plan: PlanPago): Promise<Stripe.Price> {
  const clave = LOOKUP_KEYS_CARGO[plan];
  const existe = (await stripe.prices.list({ lookup_keys: [clave], active: true, limit: 1 })).data[0];
  if (existe) return existe;
  const def = PLANES[plan];
  const producto = await stripe.products.create({ name: `Cargo por servicio de pago · FleetNautic ${def.nombre}`, description: "4 % sobre el precio del plan", metadata: { plan, concepto: "cargo" } }, { idempotencyKey: `producto-${clave}` });
  return stripe.prices.create(
    { product: producto.id, currency: "mxn", unit_amount: desglosePlan(def.precioMxnMensual ?? 0).cargoCentavos, recurring: { interval: "month" }, lookup_key: clave, tax_behavior: "exclusive" },
    { idempotencyKey: `precio-${clave}` },
  );
}

/** IVA 16 % (se suma al precio y al cargo; no está incluido). */
export async function asegurarTasaIva(stripe: Stripe): Promise<Stripe.TaxRate> {
  const todas = await stripe.taxRates.list({ active: true, limit: 100 });
  const existe = todas.data.find((t) => t.percentage === TASA_IVA_SUSCRIPCION * 100 && !t.inclusive && t.country === "MX" && t.display_name === "IVA");
  if (existe) return existe;
  return stripe.taxRates.create({ display_name: "IVA", percentage: TASA_IVA_SUSCRIPCION * 100, inclusive: false, country: "MX", jurisdiction: "MX" }, { idempotencyKey: "tasa-iva-mx-16" });
}
