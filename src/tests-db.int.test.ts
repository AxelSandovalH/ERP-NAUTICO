import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { ErrorReserva, crearReservaTx } from "@/lib/reservas/crear";

// Requiere Postgres levantado (docker compose up -d) y migraciones aplicadas.
const sfx = Math.random().toString(36).slice(2, 8);
let A: { tenant: string; emb: string; cli: string };
let B: { tenant: string; emb: string; cli: string };

async function crearTenant(nombre: string) {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}` } });
  return withTenant(t.id, async (tx) => {
    const emb = await tx.embarcacion.create({ data: { tenantId: t.id, nombre: "Barco", tipo: "YATE", capacidad: 10 } });
    const cli = await tx.cliente.create({ data: { tenantId: t.id, nombre: "Cliente" } });
    return { tenant: t.id, emb: emb.id, cli: cli.id };
  });
}

const base = (x: typeof A) => ({
  tenantId: x.tenant, embarcacionId: x.emb, clienteId: x.cli, fecha: "2030-06-01",
  pax: 2, origen: "DIRECTO" as const, totalCentavos: 1000,
});

beforeAll(async () => { A = await crearTenant("a"); B = await crearTenant("b"); });
afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } });
  await prisma.$disconnect();
});

describe("aislamiento multi-tenant (RLS)", () => {
  it("un tenant no ve los datos del otro", async () => {
    const vistoPorA = await withTenant(A.tenant, (tx) => tx.embarcacion.findMany());
    expect(vistoPorA.map((e) => e.id)).toEqual([A.emb]);
  });
  it("sin contexto de tenant no se ve ninguna fila", async () => {
    expect(await prisma.embarcacion.count()).toBe(0);
  });
  it("no se puede leer por id una fila de otro tenant", async () => {
    expect(await withTenant(A.tenant, (tx) => tx.embarcacion.findUnique({ where: { id: B.emb } }))).toBeNull();
  });
  it("no se puede escribir con el tenantId de otro", async () => {
    await expect(withTenant(A.tenant, (tx) =>
      tx.cliente.create({ data: { tenantId: B.tenant, nombre: "Intruso" } }))).rejects.toThrow();
  });
  it("update/delete cruzados no afectan filas ajenas", async () => {
    const r = await withTenant(A.tenant, (tx) => tx.embarcacion.updateMany({ where: { id: B.emb }, data: { nombre: "Hackeado" } }));
    expect(r.count).toBe(0);
    const b = await withTenant(B.tenant, (tx) => tx.embarcacion.findUniqueOrThrow({ where: { id: B.emb } }));
    expect(b.nombre).toBe("Barco");
  });
  it("los folios son independientes por tenant", async () => {
    const ra = await withTenant(A.tenant, (tx) => crearReservaTx(tx, { ...base(A), inicioMin: 0, finMin: 60 }));
    const rb = await withTenant(B.tenant, (tx) => crearReservaTx(tx, { ...base(B), inicioMin: 0, finMin: 60 }));
    expect(ra.folio).toBe(1);
    expect(rb.folio).toBe(1);
  });
});

describe("reglas de disponibilidad", () => {
  it("rechaza traslape pero permite horarios contiguos", async () => {
    await withTenant(A.tenant, (tx) => crearReservaTx(tx, { ...base(A), fecha: "2030-07-01", inicioMin: 600, finMin: 840 }));
    await expect(withTenant(A.tenant, (tx) => crearReservaTx(tx, { ...base(A), fecha: "2030-07-01", inicioMin: 780, finMin: 900 })))
      .rejects.toBeInstanceOf(ErrorReserva);
    await withTenant(A.tenant, (tx) => crearReservaTx(tx, { ...base(A), fecha: "2030-07-01", inicioMin: 840, finMin: 960 }));
  });
  it("rechaza exceder la capacidad", async () => {
    await expect(withTenant(A.tenant, (tx) => crearReservaTx(tx, { ...base(A), fecha: "2030-07-02", pax: 11, inicioMin: 600, finMin: 700 })))
      .rejects.toThrow(/máximo 10/);
  });
  it("rechaza fechas bloqueadas", async () => {
    await withTenant(A.tenant, (tx) => tx.bloqueoEmbarcacion.create({
      data: { tenantId: A.tenant, embarcacionId: A.emb, desde: new Date("2030-08-01"), hasta: new Date("2030-08-03"), motivo: "Motor" } }));
    await expect(withTenant(A.tenant, (tx) => crearReservaTx(tx, { ...base(A), fecha: "2030-08-03", inicioMin: 600, finMin: 700 })))
      .rejects.toThrow(/bloqueada/);
  });
  it("dos reservas simultáneas al mismo horario: solo una gana", async () => {
    const intentos = await Promise.allSettled(Array.from({ length: 6 }, () =>
      withTenant(A.tenant, (tx) => crearReservaTx(tx, { ...base(A), fecha: "2030-09-01", inicioMin: 600, finMin: 840 }))));
    expect(intentos.filter((i) => i.status === "fulfilled")).toHaveLength(1);
  });
  it("una reserva cancelada libera el horario", async () => {
    const r = await withTenant(A.tenant, (tx) => crearReservaTx(tx, { ...base(A), fecha: "2030-10-01", inicioMin: 600, finMin: 840 }));
    await withTenant(A.tenant, (tx) => tx.reserva.update({ where: { id: r.id }, data: { estado: "CANCELADA" } }));
    await withTenant(A.tenant, (tx) => crearReservaTx(tx, { ...base(A), fecha: "2030-10-01", inicioMin: 600, finMin: 840 }));
  });
});
