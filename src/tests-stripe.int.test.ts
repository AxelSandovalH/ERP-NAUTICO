import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { sincronizarSuscripcion } from "@/lib/stripe/sincronizar";
import type { SuscripcionMin } from "@/lib/stripe/suscripcion";

// Requiere Postgres local migrado (npm run test:db lo prepara).
const sfx = Math.random().toString(36).slice(2, 8);
let tid: string;
const sub = (o: Partial<SuscripcionMin> = {}): SuscripcionMin => ({
  id: `sub_${sfx}`, customerId: `cus_${sfx}`, status: "active", cancelAtPeriodEnd: false,
  periodoFin: 1_900_000_000, lookupKey: "fleetnautic_gestion_mensual", tenantId: tid, ...o,
});
const leer = () => prisma.tenant.findUniqueOrThrow({ where: { id: tid } });

beforeAll(async () => { tid = (await prisma.tenant.create({ data: { nombre: "st", slug: `st-${sfx}` } })).id; });
afterAll(async () => { await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } }); await prisma.$disconnect(); });

describe("sincronización de suscripciones", () => {
  it("una suscripción activa asigna plan, cliente y vencimiento", async () => {
    expect(await sincronizarSuscripcion(prisma, sub())).toBe("actualizada");
    const t = await leer();
    expect([t.plan, t.estadoSuscripcion, t.stripeCustomerId, t.cancelaAlFinal]).toEqual(["GESTION", "ACTIVA", `cus_${sfx}`, false]);
    expect(t.suscripcionVenceEn?.getTime()).toBe(1_900_000_000_000);
  });
  it("cambiar de plan y programar la cancelación se reflejan", async () => {
    await sincronizarSuscripcion(prisma, sub({ lookupKey: "fleetnautic_enterprise_mensual", cancelAtPeriodEnd: true }));
    const t = await leer();
    expect([t.plan, t.estadoSuscripcion, t.cancelaAlFinal]).toEqual(["ENTERPRISE", "ACTIVA", true]);
  });
  it("pago fallido conserva el plan y marca el estado", async () => {
    await sincronizarSuscripcion(prisma, sub({ status: "past_due" }));
    const t = await leer();
    expect([t.plan, t.estadoSuscripcion]).toEqual(["GESTION", "PAGO_PENDIENTE"]);
  });
  it("una suscripción distinta que no es la vigente no puede cancelar la actual", async () => {
    await sincronizarSuscripcion(prisma, sub({ status: "active" }));
    expect(await sincronizarSuscripcion(prisma, sub({ id: `sub_vieja_${sfx}`, status: "canceled" }))).toBe("ignorada");
    expect((await leer()).estadoSuscripcion).toBe("ACTIVA");
  });
  it("la cancelación de la vigente corta el acceso y conserva el plan", async () => {
    await sincronizarSuscripcion(prisma, sub({ status: "canceled" }));
    const t = await leer();
    expect([t.estadoSuscripcion, t.plan]).toEqual(["CANCELADA", "GESTION"]);
  });
  it("encuentra la empresa por cliente de Stripe y reporta cuando no hay", async () => {
    expect(await sincronizarSuscripcion(prisma, sub({ tenantId: null }))).toBe("actualizada");
    expect(await sincronizarSuscripcion(prisma, sub({ tenantId: null, customerId: "cus_desconocido" }))).toBe("sin_empresa");
  });
  it("estados que no conocemos no tocan nada", async () => {
    const antes = await leer();
    expect(await sincronizarSuscripcion(prisma, sub({ status: "incomplete" }))).toBe("ignorada");
    expect((await leer()).estadoSuscripcion).toBe(antes.estadoSuscripcion);
  });
});
