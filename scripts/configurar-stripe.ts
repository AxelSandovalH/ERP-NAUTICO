import "dotenv/config";
import Stripe from "stripe";
import { asegurarPrecioCargo, asegurarPrecioPlan, asegurarTasaIva } from "../src/lib/stripe/catalogo";
import { LOOKUP_KEYS, LOOKUP_KEYS_CARGO, desglosePlan } from "../src/lib/stripe/suscripcion";
import { PLANES } from "../src/modules/registry";

// OPCIONAL: la app crea sola los productos, precios y la tasa de IVA la primera vez que alguien contrata (ver src/lib/stripe/catalogo.ts).
// Este script sirve para crearlos por adelantado y configurar el portal de clientes (cancelar al fin del periodo, método de pago, facturas).
// Uso: npm run stripe:configurar -- --confirmar      (sin --confirmar solo muestra qué hay y qué haría)
// No crea el webhook: hazlo en el Dashboard (Developers → Webhooks) para que el secreto no pase por la terminal.
const confirmar = process.argv.includes("--confirmar");
const PLANES_COBRO = ["CONTROL", "GESTION", "ENTERPRISE"] as const;

async function main() {
  const llave = process.env.STRIPE_SECRET_KEY;
  if (!llave) throw new Error("Falta STRIPE_SECRET_KEY en .env");
  console.log(`Modo de la llave: ${llave.includes("_live_") ? "PRODUCCIÓN (cobros reales)" : "pruebas"}`);
  const stripe = new Stripe(llave);

  for (const plan of PLANES_COBRO) {
    const d = desglosePlan(PLANES[plan].precioMxnMensual ?? 0);
    const mx = (c: number) => (c / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    console.log(`${PLANES[plan].nombre}: ${mx(d.precioCentavos)} + cargo ${mx(d.cargoCentavos)} + IVA ${mx(d.ivaCentavos)} = ${mx(d.totalCentavos)} al mes`);
    for (const clave of [LOOKUP_KEYS[plan], LOOKUP_KEYS_CARGO[plan]]) {
      const hay = (await stripe.prices.list({ lookup_keys: [clave], active: true, limit: 1 })).data[0];
      console.log(`  ${hay ? "✓ ya existe" : confirmar ? "+ se crea" : "+ falta"}: ${clave}`);
    }
  }
  if (!confirmar) { console.log("\nNada se creó. Repite con --confirmar para aplicar."); return; }

  for (const plan of PLANES_COBRO) { await asegurarPrecioPlan(stripe, plan); await asegurarPrecioCargo(stripe, plan); }
  await asegurarTasaIva(stripe);
  console.log("✓ Precios, cargos y tasa de IVA listos.");

  // La suscripción lleva dos renglones (plan y cargo): el portal de Stripe no puede cambiar de plan en ese caso, así que solo se deja
  // cancelar, cambiar el método de pago y ver facturas. El cambio de plan se hará desde la aplicación.
  const config: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: { headline: "Administra tu suscripción de FleetNautic" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["name", "address", "tax_id"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: { enabled: false },
    },
  };
  const actual = (await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })).data[0];
  if (actual) await stripe.billingPortal.configurations.update(actual.id, config);
  else await stripe.billingPortal.configurations.create(config);
  console.log("✓ Portal de clientes configurado.");
  console.log("\nSiguiente paso: crea el webhook en el Dashboard → https://www.fleetnautic.com/api/webhooks/stripe");
  console.log("Eventos: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
