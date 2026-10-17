import "dotenv/config";
import Stripe from "stripe";
import { PLANES } from "../src/modules/registry";
import { LOOKUP_KEYS } from "../src/lib/stripe/suscripcion";

// Crea en Stripe los 3 productos/precios de FleetNautic y configura el portal de clientes (idempotente).
// Uso: npm run stripe:configurar -- --confirmar      (sin --confirmar solo muestra qué haría)
// No crea el webhook: hazlo en el Dashboard (Developers → Webhooks) para que el secreto no pase por la terminal.
const confirmar = process.argv.includes("--confirmar");
const PLANES_COBRO = ["CONTROL", "GESTION", "ENTERPRISE"] as const;

async function main() {
  const llave = process.env.STRIPE_SECRET_KEY;
  if (!llave) throw new Error("Falta STRIPE_SECRET_KEY en .env");
  const modo = llave.includes("_live_") ? "PRODUCCIÓN (cobros reales)" : "pruebas";
  console.log(`Modo de la llave: ${modo}`);
  const stripe = new Stripe(llave);
  const precios: Record<string, string> = {};

  for (const plan of PLANES_COBRO) {
    const clave = LOOKUP_KEYS[plan], def = PLANES[plan];
    const centavos = (def.precioMxnMensual ?? 0) * 100;
    const existe = (await stripe.prices.list({ lookup_keys: [clave], active: true, limit: 1 })).data[0];
    if (existe) {
      if (existe.unit_amount !== centavos) console.warn(`⚠ ${clave} ya existe con otro importe (${existe.unit_amount}); no se modifica. Crea un precio nuevo a mano si cambió la tarifa.`);
      else console.log(`✓ ${def.nombre}: ya existe (${existe.id})`);
      precios[plan] = existe.id;
      continue;
    }
    console.log(`+ ${def.nombre}: ${centavos / 100} MXN / mes${confirmar ? "" : "  (simulación)"}`);
    if (!confirmar) continue;
    const producto = await stripe.products.create({ name: `FleetNautic ${def.nombre}`, description: def.resumen, metadata: { plan } });
    const precio = await stripe.prices.create({ product: producto.id, currency: "mxn", unit_amount: centavos, recurring: { interval: "month" }, lookup_key: clave });
    precios[plan] = precio.id;
  }

  if (!confirmar) { console.log("\nNada se creó. Repite con --confirmar para aplicar."); return; }

  const ids = PLANES_COBRO.map((p) => precios[p]);
  const productos = await Promise.all(ids.map(async (id) => ((await stripe.prices.retrieve(id)).product as string)));
  const config = {
    business_profile: { headline: "Administra tu suscripción de FleetNautic" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["name", "address", "tax_id"] as Stripe.BillingPortal.ConfigurationCreateParams.Features.CustomerUpdate.AllowedUpdate[] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" as const },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price" as const],
        proration_behavior: "create_prorations" as const,
        products: productos.map((product, i) => ({ product, prices: [ids[i]] })),
      },
    },
  };
  const actual = (await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })).data[0];
  if (actual) await stripe.billingPortal.configurations.update(actual.id, config);
  else await stripe.billingPortal.configurations.create(config);
  console.log("✓ Portal de clientes configurado (cancelar al fin del periodo, cambio de plan, método de pago, facturas).");
  console.log("\nSiguiente paso: crea el webhook en el Dashboard → https://www.fleetnautic.com/api/webhooks/stripe");
  console.log("Eventos: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
