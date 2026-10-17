import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { crearReservaTx } from "@/lib/reservas/crear";
import { registrarAbono, recalcularComisionReserva } from "@/lib/comisiones/servicio";
import { generarPago, marcarPagado, cancelarPago } from "@/lib/nomina/servicio";
import { periodoDe } from "@/lib/nomina/periodos";
import {
  ErrorFinanzas, asegurarCategoriasBase, cancelarGasto, cancelarGastoDeAbono, cancelarGastoDeNomina, cancelarIngreso, cancelarIngresoDePago, cancelarTraspaso,
  crearTraspaso, gastoDesdeAbono, gastoDesdeNomina, ingresoDesdePago, obtenerConfig, registrarArqueo, registrarGasto, registrarIngreso, saldoCuenta,
  saldosPorCuenta, sincronizarPagosComoIngresos,
} from "@/lib/finanzas/servicio";

// Requiere Postgres local migrado (npm run test:db lo prepara).
const sfx = Math.random().toString(36).slice(2, 8);
type Ctx = { t: string; mxn: string; usd: string; efectivo: string };

async function crearTenant(nombre: string, moneda = "MXN"): Promise<Ctx> {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}`, moneda } });
  return withTenant(t.id, async (tx) => {
    await asegurarCategoriasBase(tx, t.id);
    const mk = (n: string, tipo: "BANCO" | "EFECTIVO", m: "MXN" | "USD", ini = 0) => tx.cuenta.create({ data: { tenantId: t.id, nombre: n, tipo, moneda: m, saldoInicialCentavos: ini } });
    return { t: t.id, mxn: (await mk("Banco MXN", "BANCO", "MXN")).id, usd: (await mk("Banco USD", "BANCO", "USD")).id, efectivo: (await mk("Caja", "EFECTIVO", "MXN", 100_000)).id };
  });
}
const F = "2031-05-10";
const gasto = (x: Ctx, o: Partial<Parameters<typeof registrarGasto>[2]> = {}) =>
  withTenant(x.t, (tx) => registrarGasto(tx, x.t, { concepto: "Gasolina", cuentaId: x.mxn, fecha: F, montoCentavos: 50_000, ...o }));
const saldo = (x: Ctx, id: string) => withTenant(x.t, (tx) => saldoCuenta(tx, id));
let A: Ctx, B: Ctx;

beforeAll(async () => { A = await crearTenant("fa"); B = await crearTenant("fb"); });
afterAll(async () => { await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } }); await prisma.$disconnect(); });

describe("aislamiento de las tablas de finanzas (RLS)", () => {
  it("un tenant no ve cuentas, gastos ni categorías del otro", async () => {
    await gasto(B);
    expect((await withTenant(A.t, (tx) => tx.cuenta.findMany())).map((c) => c.id).sort()).toEqual([A.mxn, A.usd, A.efectivo].sort());
    expect(await withTenant(A.t, (tx) => tx.gasto.count())).toBe(0);
    expect(await withTenant(A.t, (tx) => tx.categoria.count({ where: { tenantId: B.t } }))).toBe(0);
  });
  it("sin contexto de tenant no hay filas en ninguna tabla nueva", async () => {
    for (const t of ["cuenta", "categoria", "gasto", "ingreso", "traspaso", "ajusteCuenta", "arqueoCuenta", "comprobante", "configFinanzas"] as const) {
      // @ts-expect-error acceso dinámico por nombre de modelo
      expect(await prisma[t].count()).toBe(0);
    }
  });
  it("no se puede registrar un gasto en la cuenta de otra empresa", async () => {
    await expect(withTenant(A.t, (tx) => registrarGasto(tx, A.t, { concepto: "Intruso", cuentaId: B.mxn, fecha: F, montoCentavos: 100 }))).rejects.toBeInstanceOf(ErrorFinanzas);
  });
});

describe("categorías base", () => {
  it("se crean una sola vez y quedan las claves del sistema", async () => {
    await withTenant(A.t, (tx) => asegurarCategoriasBase(tx, A.t));
    const cs = await withTenant(A.t, (tx) => tx.categoria.findMany());
    expect(cs.length).toBe(15);
    expect(cs.filter((c) => c.clave).map((c) => c.clave).sort()).toEqual(["COMISIONES", "NOMINA", "RESERVAS"]);
  });
});

describe("gastos, monedas y saldos", () => {
  it("un gasto en cuenta USD (base MXN) guarda su equivalente con el tipo de cambio", async () => {
    const g = await gasto(A, { cuentaId: A.usd, montoCentavos: 10_000, tipoCambio: 18 });
    expect(g).toMatchObject({ moneda: "USD", montoCentavos: 10_000, montoBaseCentavos: 180_000, tipoCambio: 18 });
    const cfg = await withTenant(A.t, (tx) => obtenerConfig(tx, A.t));
    const g2 = await gasto(A, { cuentaId: A.usd, montoCentavos: 10_000 });
    expect(g2.tipoCambio).toBe(cfg.tipoCambio);
    expect(await saldo(A, A.usd)).toBe(-20_000); // $200 USD fuera de la cuenta
  });
  it("cancelar saca el gasto del saldo; no se cancela dos veces ni sin motivo", async () => {
    const x = await crearTenant("fc");
    const g = await gasto(x, { montoCentavos: 30_000 });
    expect(await saldo(x, x.mxn)).toBe(-30_000);
    await expect(withTenant(x.t, (tx) => cancelarGasto(tx, g.id, "u", "x"))).rejects.toThrow(/motivo/);
    await withTenant(x.t, (tx) => cancelarGasto(tx, g.id, "u", "Lo capturé dos veces"));
    expect(await saldo(x, x.mxn)).toBe(0);
    await expect(withTenant(x.t, (tx) => cancelarGasto(tx, g.id, "u", "otra vez"))).rejects.toThrow(/ya está cancelado/);
  });
  it("valida monto, fecha, cuenta inactiva y categoría de otro tipo", async () => {
    await expect(gasto(A, { montoCentavos: 0 })).rejects.toThrow(/mayor a cero/);
    await expect(gasto(A, { fecha: "2031-13-45" })).rejects.toThrow(/Fecha inválida/);
    const inactiva = await withTenant(A.t, (tx) => tx.cuenta.create({ data: { tenantId: A.t, nombre: "Vieja", activa: false } }));
    await expect(gasto(A, { cuentaId: inactiva.id })).rejects.toThrow(/inactiva/);
    const catIngreso = await withTenant(A.t, (tx) => tx.categoria.findFirstOrThrow({ where: { tipo: "INGRESO" } }));
    await expect(gasto(A, { categoriaId: catIngreso.id })).rejects.toThrow(/categoría/);
  });
  it("un ingreso suma al saldo y se cancela", async () => {
    const x = await crearTenant("fi");
    const i = await withTenant(x.t, (tx) => registrarIngreso(tx, x.t, { concepto: "Venta de souvenirs", cuentaId: x.mxn, fecha: F, montoCentavos: 70_000 }));
    expect(await saldo(x, x.mxn)).toBe(70_000);
    await withTenant(x.t, (tx) => cancelarIngreso(tx, i.id, "u", "Error de captura"));
    expect(await saldo(x, x.mxn)).toBe(0);
  });
});

describe("traspasos", () => {
  it("misma moneda: sale de una y entra a otra, sin ser gasto ni ingreso", async () => {
    const x = await crearTenant("ft");
    await withTenant(x.t, (tx) => crearTraspaso(tx, x.t, { origenId: x.efectivo, destinoId: x.mxn, montoOrigenCentavos: 40_000, fecha: F }));
    expect(await saldo(x, x.efectivo)).toBe(60_000);
    expect(await saldo(x, x.mxn)).toBe(40_000);
    expect(await withTenant(x.t, (tx) => tx.gasto.count())).toBe(0);
  });
  it("distinta moneda exige el monto recibido y calcula el tipo de cambio real", async () => {
    const x = await crearTenant("ft2");
    await expect(withTenant(x.t, (tx) => crearTraspaso(tx, x.t, { origenId: x.mxn, destinoId: x.usd, montoOrigenCentavos: 175_000, fecha: F }))).rejects.toThrow(/indica cuánto se recibió/);
    const t = await withTenant(x.t, (tx) => crearTraspaso(tx, x.t, { origenId: x.mxn, destinoId: x.usd, montoOrigenCentavos: 175_000, montoDestinoCentavos: 9_800, fecha: F }));
    expect(t.tipoCambio).toBeCloseTo(17.8571, 3);
    expect(await saldo(x, x.mxn)).toBe(-175_000);
    expect(await saldo(x, x.usd)).toBe(9_800);
    await withTenant(x.t, (tx) => cancelarTraspaso(tx, t.id));
    expect(await saldo(x, x.usd)).toBe(0);
  });
  it("no permite traspasar a la misma cuenta", async () => {
    await expect(withTenant(A.t, (tx) => crearTraspaso(tx, A.t, { origenId: A.mxn, destinoId: A.mxn, montoOrigenCentavos: 1, fecha: F }))).rejects.toThrow(/distintas/);
  });
});

describe("arqueo de caja", () => {
  it("el faltante y el sobrante quedan como ajuste y cuadran el saldo", async () => {
    const x = await crearTenant("fq");
    await gasto(x, { cuentaId: x.efectivo, montoCentavos: 20_000 }); // 100,000 − 20,000 = 80,000 teórico
    const r1 = await withTenant(x.t, (tx) => registrarArqueo(tx, x.t, { cuentaId: x.efectivo, contadoCentavos: 79_000 }));
    expect(r1.arqueo.teoricoCentavos).toBe(80_000);
    expect(r1.diferenciaCentavos).toBe(-1_000);
    expect(await saldo(x, x.efectivo)).toBe(79_000);
    const r2 = await withTenant(x.t, (tx) => registrarArqueo(tx, x.t, { cuentaId: x.efectivo, contadoCentavos: 79_000 }));
    expect(r2.diferenciaCentavos).toBe(0);
    expect(await withTenant(x.t, (tx) => tx.ajusteCuenta.count())).toBe(1); // sin diferencia no hay ajuste
    const r3 = await withTenant(x.t, (tx) => registrarArqueo(tx, x.t, { cuentaId: x.efectivo, contadoCentavos: 80_500 }));
    expect(r3.diferenciaCentavos).toBe(1_500);
    expect(await saldo(x, x.efectivo)).toBe(80_500);
  });
  it("solo se arquean cuentas de efectivo", async () => {
    await expect(withTenant(A.t, (tx) => registrarArqueo(tx, A.t, { cuentaId: A.mxn, contadoCentavos: 0 }))).rejects.toThrow(/efectivo/);
  });
  it("el listado de saldos incluye todas las cuentas", async () => {
    const todos = await withTenant(A.t, (tx) => saldosPorCuenta(tx));
    expect(todos.map((s) => s.cuenta.id)).toContain(A.efectivo);
  });
});

describe("pagos de reserva → ingresos", () => {
  const reservaConPago = async (x: Ctx, metodo: "EFECTIVO" | "TARJETA" | "TRANSFERENCIA", monto: number, fecha: string) =>
    withTenant(x.t, async (tx) => {
      const emb = (await tx.embarcacion.findFirst()) ?? (await tx.embarcacion.create({ data: { tenantId: x.t, nombre: "Barco", tipo: "YATE", capacidad: 10 } }));
      const cli = (await tx.cliente.findFirst()) ?? (await tx.cliente.create({ data: { tenantId: x.t, nombre: "Cliente Prueba" } }));
      const r = await crearReservaTx(tx, { tenantId: x.t, embarcacionId: emb.id, clienteId: cli.id, fecha, inicioMin: 600, finMin: 700, pax: 2, origen: "DIRECTO", totalCentavos: monto });
      return tx.pago.create({ data: { tenantId: x.t, reservaId: r.id, montoCentavos: monto, metodo } });
    });
  it("es idempotente y usa la cuenta por defecto del método de pago", async () => {
    const x = await crearTenant("fp");
    await withTenant(x.t, async (tx) => { const c = await obtenerConfig(tx, x.t); await tx.configFinanzas.update({ where: { tenantId: x.t }, data: { cuentaEfectivoId: x.efectivo, cuentaTransferenciaId: x.mxn } }); void c; });
    const pago = await reservaConPago(x, "EFECTIVO", 250_000, "2031-06-01");
    const i1 = await withTenant(x.t, (tx) => ingresoDesdePago(tx, x.t, pago.id));
    const i2 = await withTenant(x.t, (tx) => ingresoDesdePago(tx, x.t, pago.id));
    expect(i2?.id).toBe(i1?.id);
    expect(i1).toMatchObject({ cuentaId: x.efectivo, montoCentavos: 250_000, origen: "PAGO_RESERVA" });
    expect(i1?.concepto).toMatch(/Reserva #1 · Cliente Prueba/);
    expect(await withTenant(x.t, (tx) => tx.ingreso.count())).toBe(1);
    expect(await saldo(x, x.efectivo)).toBe(100_000 + 250_000);
  });
  it("sin cuenta por defecto no crea ingreso (y la sincronización lo avisa)", async () => {
    const x = await crearTenant("fp2");
    const pago = await reservaConPago(x, "TARJETA", 80_000, "2031-06-02");
    expect(await withTenant(x.t, (tx) => ingresoDesdePago(tx, x.t, pago.id))).toBeNull();
    expect(await withTenant(x.t, (tx) => sincronizarPagosComoIngresos(tx, x.t))).toEqual({ creados: 0, sinCuenta: 1 });
    await withTenant(x.t, (tx) => tx.configFinanzas.update({ where: { tenantId: x.t }, data: { cuentaTarjetaId: x.mxn } }));
    expect(await withTenant(x.t, (tx) => sincronizarPagosComoIngresos(tx, x.t))).toEqual({ creados: 1, sinCuenta: 0 });
  });
  it("en una cuenta USD convierte el pago al tipo de cambio de la empresa", async () => {
    const x = await crearTenant("fp3");
    const pago = await reservaConPago(x, "TRANSFERENCIA", 175_000, "2031-06-03");
    const i = await withTenant(x.t, (tx) => ingresoDesdePago(tx, x.t, pago.id, x.usd));
    expect(i).toMatchObject({ moneda: "USD", montoCentavos: 10_000, montoBaseCentavos: 175_000, tipoCambio: 17.5 });
  });
  it("al eliminar el pago, su ingreso queda cancelado y no cuenta", async () => {
    const x = await crearTenant("fp4");
    const pago = await reservaConPago(x, "TRANSFERENCIA", 90_000, "2031-06-04");
    await withTenant(x.t, (tx) => ingresoDesdePago(tx, x.t, pago.id, x.mxn));
    await withTenant(x.t, async (tx) => { await cancelarIngresoDePago(tx, pago.id); await tx.pago.delete({ where: { id: pago.id } }); });
    const i = await withTenant(x.t, (tx) => tx.ingreso.findFirstOrThrow());
    expect(i).toMatchObject({ estado: "CANCELADO", pagoId: null });
    expect(await saldo(x, x.mxn)).toBe(0);
    await expect(withTenant(x.t, (tx) => cancelarIngreso(tx, i.id, "u", "x"))).rejects.toThrow();
  });
  it("el ingreso de un pago no se cancela a mano", async () => {
    const x = await crearTenant("fp5");
    const pago = await reservaConPago(x, "TRANSFERENCIA", 50_000, "2031-06-05");
    const i = await withTenant(x.t, (tx) => ingresoDesdePago(tx, x.t, pago.id, x.mxn));
    await expect(withTenant(x.t, (tx) => cancelarIngreso(tx, i!.id, "u", "Quiero quitarlo"))).rejects.toThrow(/elimina el pago/);
  });
});

describe("nómina y comisiones → gastos", () => {
  it("pagar una nómina genera su gasto; cancelar lo cancela; volver a pagar lo reactiva (el mismo)", async () => {
    const x = await crearTenant("fn");
    const emp = await withTenant(x.t, (tx) => tx.empleado.create({ data: { tenantId: x.t, nombre: "Beto", apellido: "S", esquema: "FIJO_PERIODO", sueldoCentavos: 1_000_000 } }));
    const per = periodoDe("QUINCENAL", "2025-04-05");
    const pago = await withTenant(x.t, (tx) => generarPago(tx, x.t, emp.id, per));
    await withTenant(x.t, async (tx) => { await marcarPagado(tx, x.t, pago.id, { metodo: "TRANSFERENCIA" }); await gastoDesdeNomina(tx, x.t, pago.id, x.mxn); });
    let g = await withTenant(x.t, (tx) => tx.gasto.findFirstOrThrow({ include: { categoria: true } }));
    expect(g).toMatchObject({ origen: "NOMINA", montoCentavos: 1_000_000, estado: "ACTIVO" });
    expect(g.categoria?.clave).toBe("NOMINA");
    expect(g.concepto).toMatch(/Nómina · Beto S/);
    expect(await saldo(x, x.mxn)).toBe(-1_000_000);
    await expect(withTenant(x.t, (tx) => cancelarGasto(tx, g.id, "u", "Quiero quitarlo"))).rejects.toThrow(/cancela el pago de nómina/);
    await withTenant(x.t, async (tx) => { await cancelarPago(tx, pago.id); await cancelarGastoDeNomina(tx, pago.id); });
    expect(await saldo(x, x.mxn)).toBe(0);
    await withTenant(x.t, async (tx) => { await generarPago(tx, x.t, emp.id, per); await marcarPagado(tx, x.t, pago.id, { metodo: "EFECTIVO" }); await gastoDesdeNomina(tx, x.t, pago.id, x.efectivo); });
    g = await withTenant(x.t, (tx) => tx.gasto.findFirstOrThrow({ include: { categoria: true } }));
    expect(await withTenant(x.t, (tx) => tx.gasto.count())).toBe(1); // se reactivó, no se duplicó
    expect(g).toMatchObject({ estado: "ACTIVO", cuentaId: x.efectivo });
  });
  it("un abono de comisiones genera su gasto (una vez) y se cancela al anularlo", async () => {
    const x = await crearTenant("fm");
    const abono = await withTenant(x.t, async (tx) => {
      const b = await tx.beneficiario.create({ data: { tenantId: x.t, nombre: "Víctor", tipo: "VENDEDOR" } });
      await tx.tarifaComision.create({ data: { tenantId: x.t, beneficiarioId: b.id, tipo: "FIJO", valor: 50_000 } });
      const emb = await tx.embarcacion.create({ data: { tenantId: x.t, nombre: "B", tipo: "YATE", capacidad: 10 } });
      const cli = await tx.cliente.create({ data: { tenantId: x.t, nombre: "C" } });
      const r = await crearReservaTx(tx, { tenantId: x.t, embarcacionId: emb.id, clienteId: cli.id, fecha: "2031-07-01", inicioMin: 600, finMin: 700, pax: 2, origen: "DIRECTO", totalCentavos: 1_000_000, beneficiarioId: b.id });
      await recalcularComisionReserva(tx, x.t, r.id);
      return registrarAbono(tx, x.t, { beneficiarioId: b.id, montoCentavos: 50_000, metodo: "TRANSFERENCIA" });
    });
    const g1 = await withTenant(x.t, (tx) => gastoDesdeAbono(tx, x.t, abono.id, x.mxn));
    const g2 = await withTenant(x.t, (tx) => gastoDesdeAbono(tx, x.t, abono.id, x.mxn));
    expect(g2.id).toBe(g1.id);
    expect(g1).toMatchObject({ origen: "COMISION", montoCentavos: 50_000 });
    expect(await saldo(x, x.mxn)).toBe(-50_000);
    await withTenant(x.t, (tx) => cancelarGastoDeAbono(tx, abono.id));
    expect(await saldo(x, x.mxn)).toBe(0);
  });
});
