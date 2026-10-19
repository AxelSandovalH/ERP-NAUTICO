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

import { desglosePlan, LOOKUP_KEYS_CARGO } from "./suscripcion";
import { asegurarPrecioCargo, asegurarPrecioPlan, asegurarTasaIva } from "./catalogo";
import { aSuscripcionMin } from "./sincronizar";

describe("cobro con cargo e IVA", () => {
  it("precio + 4 % de cargo + 16 % de IVA sobre ambos", () => {
    expect(desglosePlan(6000)).toEqual({ precioCentavos: 600_000, cargoCentavos: 24_000, ivaCentavos: 99_840, totalCentavos: 723_840 });
    expect(desglosePlan(10000)).toEqual({ precioCentavos: 1_000_000, cargoCentavos: 40_000, ivaCentavos: 166_400, totalCentavos: 1_206_400 });
    expect(desglosePlan(15000)).toEqual({ precioCentavos: 1_500_000, cargoCentavos: 60_000, ivaCentavos: 249_600, totalCentavos: 1_809_600 });
  });
  it("cada plan tiene su propia clave de cargo, distinta de la del plan", () => {
    expect(new Set(Object.values(LOOKUP_KEYS_CARGO)).size).toBe(3);
    for (const k of Object.values(LOOKUP_KEYS_CARGO)) expect(Object.values(LOOKUP_KEYS)).not.toContain(k);
  });
});

/** Stripe de mentira: guarda lo que se le crea y lo devuelve en los listados. */
function stripeFalso() {
  const precios: { lookup_key: string; unit_amount: number; recurring: unknown; tax_behavior: string }[] = [];
  const tasas: { percentage: number; inclusive: boolean; country: string; display_name: string; id: string }[] = [];
  const creados: string[] = [];
  const s = {
    prices: {
      list: async ({ lookup_keys }: { lookup_keys: string[] }) => ({ data: precios.filter((p) => lookup_keys.includes(p.lookup_key)) }),
      create: async (p: (typeof precios)[number]) => { creados.push(`precio:${p.lookup_key}`); precios.push(p); return p; },
    },
    products: { create: async () => ({ id: "prod_1" }) },
    taxRates: {
      list: async () => ({ data: tasas }),
      create: async (t: Omit<(typeof tasas)[number], "id">) => { creados.push("tasa"); const x = { ...t, id: `txr_${tasas.length + 1}` }; tasas.push(x); return x; },
    },
  };
  return { stripe: s as unknown as Stripe, precios, tasas, creados };
}

describe("catálogo de la suscripción", () => {
  it("crea el precio del plan y su cargo con los importes correctos, y no los duplica", async () => {
    const { stripe, precios, creados } = stripeFalso();
    const plan = await asegurarPrecioPlan(stripe, "CONTROL");
    const cargo = await asegurarPrecioCargo(stripe, "CONTROL");
    expect(plan).toMatchObject({ lookup_key: "fleetnautic_control_mensual", unit_amount: 600_000, tax_behavior: "exclusive", recurring: { interval: "month" } });
    expect(cargo).toMatchObject({ lookup_key: "fleetnautic_control_cargo", unit_amount: 24_000 });
    await asegurarPrecioPlan(stripe, "CONTROL"); await asegurarPrecioCargo(stripe, "CONTROL");
    expect(precios).toHaveLength(2);
    expect(creados).toHaveLength(2);
  });
  it("cada plan lleva su cargo: 10,000 → 400.00 y 15,000 → 600.00", async () => {
    const { stripe } = stripeFalso();
    expect((await asegurarPrecioCargo(stripe, "GESTION")).unit_amount).toBe(40_000);
    expect((await asegurarPrecioCargo(stripe, "ENTERPRISE")).unit_amount).toBe(60_000);
  });
  it("la tasa de IVA es del 16 %, no incluida, y se reutiliza", async () => {
    const { stripe, tasas } = stripeFalso();
    const a = await asegurarTasaIva(stripe), b = await asegurarTasaIva(stripe);
    expect(a).toMatchObject({ percentage: 16, inclusive: false, country: "MX", display_name: "IVA" });
    expect(b.id).toBe(a.id);
    expect(tasas).toHaveLength(1);
  });
});

describe("la suscripción con dos renglones", () => {
  const item = (lookup_key: string | null, fin: number) => ({ current_period_end: fin, price: { lookup_key } });
  const sub = (items: unknown[]) => ({ id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, metadata: { tenantId: "t1" }, items: { data: items } }) as unknown as Stripe.Subscription;
  it("el plan lo marca el renglón con clave de plan, aunque el cargo vaya primero", () => {
    const m = aSuscripcionMin(sub([item("fleetnautic_gestion_cargo", 111), item("fleetnautic_gestion_mensual", 222)]));
    expect(m.lookupKey).toBe("fleetnautic_gestion_mensual");
    expect(m.periodoFin).toBe(222);
  });
  it("sin renglón de plan toma el primero (suscripciones anteriores al cargo)", () => {
    expect(aSuscripcionMin(sub([item("fleetnautic_control_mensual", 5)])).lookupKey).toBe("fleetnautic_control_mensual");
    expect(aSuscripcionMin(sub([item(null, 9)])).lookupKey).toBeNull();
  });
});

import { cambiarPlanEnStripe, ErrorCambioPlan, modulosQueSePierden } from "./cambio-plan";
import { esMejora } from "./suscripcion";

describe("cambio de plan", () => {
  it("subir o bajar según el orden de los planes", () => {
    expect(esMejora("CONTROL", "GESTION")).toBe(true);
    expect(esMejora("CONTROL", "ENTERPRISE")).toBe(true);
    expect(esMejora("ENTERPRISE", "GESTION")).toBe(false);
    expect(esMejora("GESTION", "CONTROL")).toBe(false);
  });
  it("al bajar se listan los módulos que se pierden, sin el núcleo ni lo que Cuentas trae implícito", () => {
    const de = modulosQueSePierden("ENTERPRISE", "CONTROL");
    expect(de).toEqual(expect.arrayContaining(["Conciliación bancaria", "Nómina", "Comisiones", "Inventario", "Transporte", "Facturación"]));
    expect(de).not.toContain("Horarios"); // Control también lo incluye
    expect(modulosQueSePierden("CONTROL", "ENTERPRISE")).toEqual([]);
    expect(modulosQueSePierden("GESTION", "CONTROL")).toEqual(expect.arrayContaining(["Inventario", "Transporte", "Facturación", "Equipo"]));
  });

  /** Stripe de mentira con una suscripción de dos renglones. */
  function conSuscripcion(o: { status?: string; cancelar?: boolean; sinCargo?: boolean; plan?: string } = {}) {
    const f = stripeFalso();
    const actual = o.plan ?? "fleetnautic_control_mensual";
    const items = [{ id: "si_plan", price: { lookup_key: actual } }, ...(o.sinCargo ? [] : [{ id: "si_cargo", price: { lookup_key: actual.replace("_mensual", "_cargo") } }])];
    const llamadas: { id: string; params: Record<string, unknown>; opciones: Record<string, unknown> }[] = [];
    (f.stripe as unknown as Record<string, unknown>).subscriptions = {
      retrieve: async () => ({ id: "sub_1", status: o.status ?? "active", cancel_at_period_end: !!o.cancelar, metadata: { tenantId: "t1" }, items: { data: items } }),
      update: async (id: string, params: Record<string, unknown>, opciones: Record<string, unknown>) => { llamadas.push({ id, params, opciones }); return { id, ...params }; },
    };
    return { stripe: f.stripe, llamadas };
  }

  it("subir de plan: cambia los dos renglones, cobra la diferencia ya y no deja la suscripción a medias si falla el cobro", async () => {
    const { stripe, llamadas } = conSuscripcion();
    await cambiarPlanEnStripe(stripe, "sub_1", "GESTION");
    const { params, opciones } = llamadas[0];
    expect(params).toMatchObject({ proration_behavior: "always_invoice", payment_behavior: "error_if_incomplete", metadata: { tenantId: "t1", plan: "GESTION" } });
    const items = params.items as { id?: string; price: string; tax_rates: string[] }[];
    expect(items.map((i) => i.id)).toEqual(["si_plan", "si_cargo"]);
    expect(items.every((i) => i.tax_rates.length === 1)).toBe(true);
    expect(String(opciones.idempotencyKey)).toMatch(/^cambio-sub_1-CONTROL-GESTION-/);
  });
  it("bajar de plan: la diferencia queda como saldo a favor, sin cobrar", async () => {
    const { stripe, llamadas } = conSuscripcion({ plan: "fleetnautic_enterprise_mensual" });
    await cambiarPlanEnStripe(stripe, "sub_1", "CONTROL");
    expect(llamadas[0].params).toMatchObject({ proration_behavior: "create_prorations" });
  });
  it("una suscripción anterior al cargo recibe ese renglón nuevo", async () => {
    const { stripe, llamadas } = conSuscripcion({ sinCargo: true });
    await cambiarPlanEnStripe(stripe, "sub_1", "GESTION");
    const items = llamadas[0].params.items as { id?: string }[];
    expect(items).toHaveLength(2);
    expect(items[1].id).toBeUndefined();
  });
  it("rechaza el mismo plan, una suscripción inactiva o programada para cancelarse, sin llamar a actualizar", async () => {
    for (const [o, plan, texto] of [[{}, "CONTROL", /Ya estás/], [{ status: "past_due" }, "GESTION", /no está activa/], [{ cancelar: true }, "GESTION", /cancelarse/]] as const) {
      const { stripe, llamadas } = conSuscripcion(o);
      await expect(cambiarPlanEnStripe(stripe, "sub_1", plan)).rejects.toThrow(texto);
      expect(llamadas).toHaveLength(0);
    }
    const raro = conSuscripcion({ plan: "producto_ajeno" });
    await expect(cambiarPlanEnStripe(raro.stripe, "sub_1", "GESTION")).rejects.toThrow(ErrorCambioPlan);
  });
});
