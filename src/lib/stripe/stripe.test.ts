import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { LOOKUP_KEYS, aplicaALaEmpresa, estadoDeStripe, esPlanPago, lookupKeyDe, planDeLookupKey, resumirSuscripcion, type SuscripcionMin } from "./suscripcion";
import { MODULOS_POR_PLAN, modulosEfectivos } from "@/modules/registry";

const sub = (o: Partial<SuscripcionMin> = {}): SuscripcionMin => ({ id: "sub_1", customerId: "cus_1", status: "active", cancelAtPeriodEnd: false, periodoFin: 1_800_000_000, lookupKey: LOOKUP_KEYS.GESTION, tenantId: "t1", ...o });

describe("precios por lookup_key", () => {
  it("cada plan de pago tiene su clave y se resuelve en ambos sentidos", () => {
    expect(lookupKeyDe("CONTROL")).toBe("fleetnautic_control_mensual");
    for (const p of ["CONTROL", "GESTION", "ENTERPRISE"] as const) expect(planDeLookupKey(lookupKeyDe(p))).toBe(p);
    expect(new Set(Object.values(LOOKUP_KEYS)).size).toBe(3);
  });
  it("una clave desconocida no resuelve a ningún plan (nunca se adivina)", () => {
    for (const k of ["otra_cosa", "", null, undefined, "FLEETNAUTIC_CONTROL_MENSUAL"]) expect(planDeLookupKey(k as string)).toBeNull();
  });
  it("solo los planes de pago se pueden contratar (la prueba no)", () => {
    expect(esPlanPago("ENTERPRISE")).toBe(true);
    expect(esPlanPago("PRUEBA")).toBe(false);
    expect(esPlanPago("x")).toBe(false);
  });
});

describe("estado de la suscripción", () => {
  it("activa y en prueba dan acceso; vencida con reintentos conserva acceso con aviso", () => {
    expect(estadoDeStripe("active")).toBe("ACTIVA");
    expect(estadoDeStripe("trialing")).toBe("ACTIVA");
    expect(estadoDeStripe("past_due")).toBe("PAGO_PENDIENTE");
  });
  it("cancelada o sin poder cobrarse quita el acceso", () => {
    for (const s of ["canceled", "unpaid", "incomplete_expired", "paused"]) expect(estadoDeStripe(s)).toBe("CANCELADA");
  });
  it("estados no concluyentes no cambian nada", () => {
    expect(estadoDeStripe("incomplete")).toBe("IGNORAR");
    expect(estadoDeStripe("algo_nuevo")).toBe("IGNORAR");
    expect(resumirSuscripcion(sub({ status: "incomplete" }))).toBeNull();
  });
  it("el resumen trae plan, vencimiento y si pidió cancelar", () => {
    const r = resumirSuscripcion(sub({ cancelAtPeriodEnd: true }))!;
    expect(r).toMatchObject({ estado: "ACTIVA", plan: "GESTION", cancelaAlFinal: true });
    expect(r.venceEn?.getTime()).toBe(1_800_000_000_000);
    expect(resumirSuscripcion(sub({ periodoFin: null, lookupKey: "x" }))).toMatchObject({ plan: null, venceEn: null });
  });
});

describe("la suscripción vieja no deja sin acceso a la nueva", () => {
  const viva = { stripeSubscriptionId: "sub_nueva", estadoSuscripcion: "ACTIVA" as const, plan: "GESTION" as const };
  it("el cierre de otra suscripción se ignora si ya hay una activa", () => {
    expect(aplicaALaEmpresa(viva, "sub_vieja", "CANCELADA")).toBe(false);
  });
  it("el cierre de la suscripción actual sí aplica, y una nueva activa también", () => {
    expect(aplicaALaEmpresa(viva, "sub_nueva", "CANCELADA")).toBe(true);
    expect(aplicaALaEmpresa(viva, "sub_otra", "ACTIVA")).toBe(true);
    expect(aplicaALaEmpresa({ ...viva, estadoSuscripcion: "CANCELADA" }, "sub_vieja", "CANCELADA")).toBe(true);
    expect(aplicaALaEmpresa({ stripeSubscriptionId: null, estadoSuscripcion: "NINGUNA", plan: "PRUEBA" }, "sub_1", "ACTIVA")).toBe(true);
  });
});

describe("acceso según la suscripción", () => {
  const todos = MODULOS_POR_PLAN.ENTERPRISE as string[];
  it("cancelada: solo el núcleo; activa, pendiente o sin suscripción: todo lo del plan", () => {
    expect(modulosEfectivos("ENTERPRISE", todos, "CANCELADA")).toEqual(["nucleo"]);
    for (const e of ["ACTIVA", "PAGO_PENDIENTE", "NINGUNA", undefined] as const) expect(modulosEfectivos("ENTERPRISE", todos, e)).toContain("nomina");
  });
});

describe("firma de los webhooks de Stripe", () => {
  const secreto = "whsec_prueba_123";
  const cuerpo = JSON.stringify({ id: "evt_1", object: "event", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
  const stripe = new Stripe("sk_test_x");
  it("acepta un evento firmado con el secreto correcto", () => {
    const firma = stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: secreto });
    expect(stripe.webhooks.constructEvent(cuerpo, firma, secreto).id).toBe("evt_1");
  });
  it("rechaza firma ajena, cuerpo alterado, firma ausente y eventos viejos (repetición)", () => {
    const firma = stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: secreto });
    expect(() => stripe.webhooks.constructEvent(cuerpo, firma, "whsec_otro")).toThrow();
    expect(() => stripe.webhooks.constructEvent(cuerpo + " ", firma, secreto)).toThrow();
    expect(() => stripe.webhooks.constructEvent(cuerpo, "", secreto)).toThrow();
    const vieja = stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: secreto, timestamp: Math.floor(Date.now() / 1000) - 3600 });
    expect(() => stripe.webhooks.constructEvent(cuerpo, vieja, secreto)).toThrow(/tolerance|timestamp/i);
  });
});
