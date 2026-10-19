"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireSesion } from "@/lib/auth/session";
import { puede } from "@/modules/permisos";
import { origenActual } from "@/lib/origen";
import { stripe, stripeConfigurado } from "@/lib/stripe/cliente";
import { asegurarPrecioCargo, asegurarPrecioPlan, asegurarTasaIva } from "@/lib/stripe/catalogo";
import type { EstadoForm } from "@/components/formulario";

const planSchema = z.enum(["CONTROL", "GESTION", "ENTERPRISE"]);

async function admin() {
  const s = await requireSesion();
  if (!puede(s.rol, "usuarios:administrar")) throw new Error("Sin permiso");
  if (!stripeConfigurado()) throw new Error("El cobro no está configurado");
  return s;
}

/** Cliente de Stripe de la empresa: se crea una sola vez (la llave de idempotencia evita duplicados por doble clic). */
async function clienteDe(tenantId: string, nombre: string, email: string) {
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (t.stripeCustomerId) return t.stripeCustomerId;
  const c = await stripe().customers.create({ name: nombre, email, metadata: { tenantId } }, { idempotencyKey: `cliente-${tenantId}` });
  await prisma.tenant.update({ where: { id: tenantId }, data: { stripeCustomerId: c.id } });
  return c.id;
}

/** Lleva a Stripe Checkout para contratar un plan. El plan NO se activa aquí: lo activa el webhook al confirmarse el pago. */
export async function iniciarSuscripcionAccion(plan: string, _: EstadoForm): Promise<EstadoForm> {
  const s = await admin();
  const p = planSchema.safeParse(plan);
  if (!p.success) return { error: "Plan inválido." };
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: s.tenantId } });
  if (t.estadoSuscripcion === "ACTIVA" || t.estadoSuscripcion === "PAGO_PENDIENTE") return { error: "Ya tienes una suscripción. Usa «Administrar suscripción» para cambiarla." };

  let url: string | null;
  try {
    // El plan, su cargo por servicio de pago (4 %) y el IVA (16 % sobre ambos) como renglones del mismo cobro mensual
    const [precio, cargo, iva] = await Promise.all([asegurarPrecioPlan(stripe(), p.data), asegurarPrecioCargo(stripe(), p.data), asegurarTasaIva(stripe())]);
    const cliente = await clienteDe(s.tenantId, s.tenantNombre, s.email);
    const origen = await origenActual();
    const sesion = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: cliente,
      client_reference_id: s.tenantId,
      line_items: [{ price: precio.id, quantity: 1, tax_rates: [iva.id] }, { price: cargo.id, quantity: 1, tax_rates: [iva.id] }],
      subscription_data: { metadata: { tenantId: s.tenantId, plan: p.data } },
      metadata: { tenantId: s.tenantId, plan: p.data },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_update: { name: "auto", address: "auto" },
      locale: "es",
      success_url: `${origen}/configuracion?pago=ok`,
      cancel_url: `${origen}/configuracion?pago=cancelado`,
    });
    url = sesion.url;
  } catch (e) {
    console.error("[stripe] checkout:", e);
    return { error: "No se pudo iniciar el pago. Intenta de nuevo en un momento." };
  }
  if (!url) return { error: "No se pudo iniciar el pago." };
  redirect(url);
}

/** Portal de Stripe: cambiar de plan, método de pago, facturas y cancelar. */
export async function abrirPortalAccion(_: EstadoForm): Promise<EstadoForm> {
  const s = await admin();
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: s.tenantId } });
  if (!t.stripeCustomerId) return { error: "Aún no tienes una suscripción." };
  let url: string;
  try {
    const sesion = await stripe().billingPortal.sessions.create({ customer: t.stripeCustomerId, return_url: `${await origenActual()}/configuracion` });
    url = sesion.url;
  } catch (e) {
    console.error("[stripe] portal:", e);
    return { error: "No se pudo abrir el portal de pagos. Intenta de nuevo." };
  }
  redirect(url);
}
