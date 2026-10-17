import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { crearReservaTx } from "@/lib/reservas/crear";
import {
  ErrorComision, ajustarMonto, anularAbono, cerrarPeriodo, recalcularComisionReserva, recalcularPeriodo, reabrirPeriodo, registrarAbono,
} from "@/lib/comisiones/servicio";

// Requiere Postgres local migrado (npm run test:db lo prepara).
const sfx = Math.random().toString(36).slice(2, 8);
type Ctx = { tenant: string; emb: string; cli: string; ben: string };
let A: Ctx, B: Ctx;

async function crearTenant(nombre: string): Promise<Ctx> {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}` } });
  return withTenant(t.id, async (tx) => {
    const emb = await tx.embarcacion.create({ data: { tenantId: t.id, nombre: "Barco", tipo: "YATE", capacidad: 20, precioCasaCentavos: 2_000_000, paxIncluidosCasa: 10, extraPaxCasaCentavos: 100_000 } });
    const cli = await tx.cliente.create({ data: { tenantId: t.id, nombre: "Cliente" } });
    const ben = await tx.beneficiario.create({ data: { tenantId: t.id, nombre: "Vendedor", tipo: "VENDEDOR" } });
    return { tenant: t.id, emb: emb.id, cli: cli.id, ben: ben.id };
  });
}

let dia = 0;
const reserva = (x: Ctx, o: { total?: number; pax?: number; origen?: "DIRECTO" | "WEB"; fecha?: string; sinBeneficiario?: boolean } = {}) =>
  withTenant(x.tenant, async (tx) => {
    dia++;
    return crearReservaTx(tx, {
      tenantId: x.tenant, embarcacionId: x.emb, clienteId: x.cli, fecha: o.fecha ?? `2031-03-${String(dia).padStart(2, "0")}`,
      inicioMin: 600, finMin: 840, pax: o.pax ?? 8, origen: o.origen ?? "DIRECTO", totalCentavos: o.total ?? 3_800_000,
      beneficiarioId: o.sinBeneficiario ? null : x.ben,
    });
  });
const tarifa = (x: Ctx, d: { tipo: "FIJO" | "PORCENTAJE" | "PORCENTAJE_BALANCE" | "SIN"; valor?: number; origen?: "WEB"; umbralPax?: number; valorAlto?: number }) =>
  withTenant(x.tenant, (tx) => tx.tarifaComision.create({ data: { tenantId: x.tenant, beneficiarioId: x.ben, tipo: d.tipo, valor: d.valor ?? 0, origen: d.origen ?? null, umbralPax: d.umbralPax, valorAlto: d.valorAlto } }));
const recalc = (x: Ctx, id: string) => withTenant(x.tenant, (tx) => recalcularComisionReserva(tx, x.tenant, id));
const comisionDe = (x: Ctx, reservaId: string) => withTenant(x.tenant, (tx) => tx.comision.findUnique({ where: { reservaId } }));

beforeAll(async () => { A = await crearTenant("ca"); B = await crearTenant("cb"); });
afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } });
  await prisma.$disconnect();
});

describe("aislamiento de las tablas nuevas (RLS)", () => {
  it("un tenant no ve beneficiarios ni comisiones del otro", async () => {
    const r = await reserva(B);
    await tarifa(B, { tipo: "FIJO", valor: 1000 });
    await recalc(B, r.id);
    expect((await withTenant(A.tenant, (tx) => tx.beneficiario.findMany())).map((b) => b.id)).toEqual([A.ben]);
    expect(await withTenant(A.tenant, (tx) => tx.comision.count())).toBe(0);
    expect(await withTenant(A.tenant, (tx) => tx.tarifaComision.count())).toBe(0);
  });
  it("sin contexto de tenant no hay filas en ninguna tabla nueva", async () => {
    for (const t of ["beneficiario", "tarifaComision", "comision", "abonoComision", "abonoAplicacion", "cierreComision", "tripulante", "reservaTripulante", "tripulanteEmbarcacion"] as const) {
      // @ts-expect-error acceso dinámico por nombre de modelo
      expect(await prisma[t].count()).toBe(0);
    }
  });
  it("no se puede crear una tarifa con el tenantId de otro", async () => {
    await expect(withTenant(A.tenant, (tx) => tx.tarifaComision.create({ data: { tenantId: B.tenant, beneficiarioId: B.ben, tipo: "SIN", valor: 0 } }))).rejects.toThrow();
  });
});

describe("cálculo y recálculo", () => {
  it("sin tarifa: comisión en 0 con advertencia", async () => {
    const r = await reserva(A);
    expect(await recalc(A, r.id)).toBe("creada");
    const c = await comisionDe(A, r.id);
    expect(c?.montoCentavos).toBe(0);
    expect(c?.advertencia).toBeTruthy();
  });
  it("la tarifa por origen manda sobre la general", async () => {
    await tarifa(A, { tipo: "PORCENTAJE", valor: 1000 }); // 10 % general
    await tarifa(A, { tipo: "SIN", origen: "WEB" }); // WEB: sin comisión
    const directa = await reserva(A, { total: 1_000_000 });
    const web = await reserva(A, { total: 1_000_000, origen: "WEB" });
    await recalc(A, directa.id); await recalc(A, web.id);
    expect((await comisionDe(A, directa.id))?.montoCentavos).toBe(100_000);
    expect((await comisionDe(A, web.id))?.montoCentavos).toBe(0);
  });
  it("recalcular actualiza la misma comisión (una por reserva)", async () => {
    const r = await reserva(A, { total: 2_000_000 });
    await recalc(A, r.id);
    expect(await recalc(A, r.id)).toBe("actualizada");
    expect(await withTenant(A.tenant, (tx) => tx.comision.count({ where: { reservaId: r.id } }))).toBe(1);
  });
  it("sin beneficiario no hay comisión", async () => {
    const r = await reserva(A, { sinBeneficiario: true });
    expect(await recalc(A, r.id)).toBe("sin_beneficiario");
    expect(await comisionDe(A, r.id)).toBeNull();
  });
  it("cancelar la reserva cancela su comisión sin pagos", async () => {
    const r = await reserva(A, { total: 1_000_000 });
    await recalc(A, r.id);
    await withTenant(A.tenant, (tx) => tx.reserva.update({ where: { id: r.id }, data: { estado: "CANCELADA" } }));
    await recalc(A, r.id);
    expect((await comisionDe(A, r.id))?.estado).toBe("CANCELADA");
  });
  it("un ajuste manual no lo pisa el recálculo", async () => {
    const r = await reserva(A, { total: 1_000_000 });
    await recalc(A, r.id);
    const c = (await comisionDe(A, r.id))!;
    await withTenant(A.tenant, (tx) => ajustarMonto(tx, c.id, 77_700, "acuerdo especial"));
    expect(await recalc(A, r.id)).toBe("manual");
    expect((await comisionDe(A, r.id))?.montoCentavos).toBe(77_700);
  });
});

describe("abonos", () => {
  let ctx: Ctx;
  const ids: string[] = [];
  beforeAll(async () => {
    ctx = await crearTenant("ab");
    await tarifa(ctx, { tipo: "FIJO", valor: 10_000 }); // $100 por reserva
    for (const f of ["2031-05-01", "2031-05-02", "2031-05-03"]) {
      const r = await reserva(ctx, { fecha: f });
      await recalc(ctx, r.id);
      ids.push(r.id);
    }
  });
  it("se aplica a las más antiguas primero y deja la última en parcial", async () => {
    await withTenant(ctx.tenant, (tx) => registrarAbono(tx, ctx.tenant, { beneficiarioId: ctx.ben, montoCentavos: 25_000, metodo: "TRANSFERENCIA" }));
    const cs = await Promise.all(ids.map((id) => comisionDe(ctx, id)));
    expect(cs.map((c) => [c?.estado, c?.pagadoCentavos])).toEqual([["PAGADA", 10_000], ["PAGADA", 10_000], ["PENDIENTE", 5_000]]);
  });
  it("rechaza abonar más de lo pendiente", async () => {
    await expect(withTenant(ctx.tenant, (tx) => registrarAbono(tx, ctx.tenant, { beneficiarioId: ctx.ben, montoCentavos: 5_001, metodo: "EFECTIVO" })))
      .rejects.toBeInstanceOf(ErrorComision);
  });
  it("dos abonos simultáneos no se aplican dos veces a la misma comisión", async () => {
    const res = await Promise.allSettled([1, 2].map(() =>
      withTenant(ctx.tenant, (tx) => registrarAbono(tx, ctx.tenant, { beneficiarioId: ctx.ben, montoCentavos: 5_000, metodo: "EFECTIVO" }))));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1); // solo quedaba $50 pendientes
    const c = await comisionDe(ctx, ids[2]);
    expect(c?.pagadoCentavos).toBe(10_000);
    expect(c?.estado).toBe("PAGADA");
  });
  it("anular un abono revierte lo aplicado", async () => {
    const abono = (await withTenant(ctx.tenant, (tx) => tx.abonoComision.findMany({ orderBy: { fecha: "asc" } })))[0];
    await withTenant(ctx.tenant, (tx) => anularAbono(tx, abono.id));
    const cs = await Promise.all(ids.map((id) => comisionDe(ctx, id)));
    expect(cs.reduce((s, c) => s + (c?.pagadoCentavos ?? 0), 0)).toBe(30_000 - 25_000);
    expect(cs.some((c) => c?.estado === "PENDIENTE")).toBe(true);
  });
});

describe("cierre de periodo", () => {
  it("un periodo cerrado congela montos; reabrirlo exige motivo", async () => {
    const x = await crearTenant("ci");
    await tarifa(x, { tipo: "FIJO", valor: 5_000 });
    const r = await reserva(x, { fecha: "2031-07-10" });
    await recalc(x, r.id);
    const c = (await comisionDe(x, r.id))!;
    await withTenant(x.tenant, (tx) => cerrarPeriodo(tx, x.tenant, "2031-07", "u1"));
    expect(await recalc(x, r.id)).toBe("periodo_cerrado");
    await expect(withTenant(x.tenant, (tx) => ajustarMonto(tx, c.id, 9_000, "x"))).rejects.toBeInstanceOf(ErrorComision);
    await expect(withTenant(x.tenant, (tx) => recalcularPeriodo(tx, x.tenant, "2031-07"))).rejects.toBeInstanceOf(ErrorComision);
    // las reservas nuevas de un periodo cerrado tampoco generan comisión
    const nueva = await reserva(x, { fecha: "2031-07-11" });
    expect(await recalc(x, nueva.id)).toBe("periodo_cerrado");
    expect(await comisionDe(x, nueva.id)).toBeNull();
    await expect(withTenant(x.tenant, (tx) => reabrirPeriodo(tx, x.tenant, "2031-07", "u1", ""))).rejects.toBeInstanceOf(ErrorComision);
    await withTenant(x.tenant, (tx) => reabrirPeriodo(tx, x.tenant, "2031-07", "u1", "corrección de tarifa"));
    expect(await recalc(x, nueva.id)).toBe("creada");
  });
  it("recalcularPeriodo recalcula las comisiones del mes tras cambiar la tarifa", async () => {
    const x = await crearTenant("rp");
    const t = await tarifa(x, { tipo: "FIJO", valor: 1_000 });
    const r = await reserva(x, { fecha: "2031-08-05" });
    await recalc(x, r.id);
    await withTenant(x.tenant, (tx) => tx.tarifaComision.update({ where: { id: t.id }, data: { valor: 2_000 } }));
    const res = await withTenant(x.tenant, (tx) => recalcularPeriodo(tx, x.tenant, "2031-08"));
    expect(res.actualizada).toBe(1);
    expect((await comisionDe(x, r.id))?.montoCentavos).toBe(2_000);
  });
});

describe("asignación de tripulación", () => {
  it("no permite asignar a dos reservas que se traslapan, pero sí a horarios contiguos", async () => {
    const { asignarTripulanteTx, ErrorTripulacion, horaLlegadaPorDefecto } = await import("@/lib/tripulacion/asignar");
    const x = await crearTenant("tr");
    const t = await withTenant(x.tenant, (tx) => tx.tripulante.create({ data: { tenantId: x.tenant, nombre: "Beto", rol: "CAPITAN" } }));
    const mk = (inicio: number, fin: number) => withTenant(x.tenant, (tx) => crearReservaTx(tx, {
      tenantId: x.tenant, embarcacionId: x.emb, clienteId: x.cli, fecha: "2031-09-20", inicioMin: inicio, finMin: fin, pax: 2, origen: "DIRECTO", totalCentavos: 1000,
    }));
    const a = await mk(600, 840);
    const asignar = (reservaId: string) => withTenant(x.tenant, (tx) => asignarTripulanteTx(tx, x.tenant, { reservaId, tripulanteId: t.id, rol: "CAPITAN" }));
    const asignada = await asignar(a.id);
    expect(asignada.horaLlegada).toBe(horaLlegadaPorDefecto(600)); // 08:00, 2 h antes
    expect(asignada.horaLlegada).toBe("08:00");
    // otro barco el mismo día, traslapado → rechazado
    const otroBarco = await withTenant(x.tenant, (tx) => tx.embarcacion.create({ data: { tenantId: x.tenant, nombre: "Barco 2", tipo: "LANCHA", capacidad: 10 } }));
    const b = await withTenant(x.tenant, (tx) => crearReservaTx(tx, {
      tenantId: x.tenant, embarcacionId: otroBarco.id, clienteId: x.cli, fecha: "2031-09-20", inicioMin: 780, finMin: 900, pax: 2, origen: "DIRECTO", totalCentavos: 1000,
    }));
    await expect(asignar(b.id)).rejects.toBeInstanceOf(ErrorTripulacion);
    // contiguo (14:00–16:00) → permitido
    const c = await withTenant(x.tenant, (tx) => crearReservaTx(tx, {
      tenantId: x.tenant, embarcacionId: otroBarco.id, clienteId: x.cli, fecha: "2031-09-21", inicioMin: 840, finMin: 960, pax: 2, origen: "DIRECTO", totalCentavos: 1000,
    }));
    await asignar(c.id);
    // la misma asignación dos veces → rechazada
    await expect(asignar(a.id)).rejects.toBeInstanceOf(ErrorTripulacion);
  });
  it("una reserva cancelada no admite tripulación; un tripulante inactivo tampoco", async () => {
    const { asignarTripulanteTx, ErrorTripulacion } = await import("@/lib/tripulacion/asignar");
    const x = await crearTenant("tr2");
    const t = await withTenant(x.tenant, (tx) => tx.tripulante.create({ data: { tenantId: x.tenant, nombre: "Inactivo", rol: "MARINERO", activo: false } }));
    const r = await reserva(x, { fecha: "2031-09-25" });
    await expect(withTenant(x.tenant, (tx) => asignarTripulanteTx(tx, x.tenant, { reservaId: r.id, tripulanteId: t.id, rol: "MARINERO" }))).rejects.toBeInstanceOf(ErrorTripulacion);
    const t2 = await withTenant(x.tenant, (tx) => tx.tripulante.create({ data: { tenantId: x.tenant, nombre: "Activo", rol: "MARINERO" } }));
    await withTenant(x.tenant, (tx) => tx.reserva.update({ where: { id: r.id }, data: { estado: "CANCELADA" } }));
    await expect(withTenant(x.tenant, (tx) => asignarTripulanteTx(tx, x.tenant, { reservaId: r.id, tripulanteId: t2.id, rol: "MARINERO" }))).rejects.toBeInstanceOf(ErrorTripulacion);
  });
});
