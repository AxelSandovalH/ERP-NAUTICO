import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { asegurarCategoriasBase, cancelarGasto, saldoCuenta } from "@/lib/finanzas/servicio";
import {
  anularMovimiento, asegurarUbicaciones, contarPorReabastecer, crearAlmacen, existencias, guardarArticulo, registrarCompra, registrarConsumo, registrarConteo,
  registrarMerma, resumenInventario, traspasar,
} from "@/lib/inventario/servicio";

// Requiere Postgres local migrado (npm run test:db lo prepara).
const sfx = Math.random().toString(36).slice(2, 8);
type Ctx = { t: string; almacen: string; barco: string; cuenta: string; hielo: string; cloro: string };
const F = "2031-04-10";

async function crearTenant(nombre: string): Promise<Ctx> {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}`, moneda: "MXN" } });
  return withTenant(t.id, async (tx) => {
    await asegurarCategoriasBase(tx, t.id);
    await tx.embarcacion.create({ data: { tenantId: t.id, nombre: "Alfa", tipo: "YATE", capacidad: 10 } });
    await asegurarUbicaciones(tx, t.id);
    const ubs = await tx.ubicacion.findMany();
    const cuenta = await tx.cuenta.create({ data: { tenantId: t.id, nombre: "Banco", tipo: "BANCO", moneda: "MXN", saldoInicialCentavos: 1_000_000 } });
    const hielo = await guardarArticulo(tx, t.id, null, { nombre: "Hielo", unidad: "bolsa", minimoMilli: 5_000 });
    const cloro = await guardarArticulo(tx, t.id, null, { nombre: "Cloro", unidad: "L", minimoMilli: 0 });
    return { t: t.id, almacen: ubs.find((u) => u.tipo === "ALMACEN")!.id, barco: ubs.find((u) => u.tipo === "EMBARCACION")!.id, cuenta: cuenta.id, hielo: hielo.id, cloro: cloro.id };
  });
}
const compra = (x: Ctx, o: Partial<Parameters<typeof registrarCompra>[2]> = {}) =>
  withTenant(x.t, (tx) => registrarCompra(tx, x.t, { articuloId: x.hielo, ubicacionId: x.almacen, cantidadMilli: 10_000, fecha: F, totalCentavos: 50_000, cuentaId: x.cuenta, ...o }));
const consumo = (x: Ctx, cantidadMilli: number, ubicacionId = x.almacen, articuloId = x.hielo) => withTenant(x.t, (tx) => registrarConsumo(tx, x.t, { articuloId, ubicacionId, cantidadMilli, fecha: F }));
const hay = async (x: Ctx, articulo: string, ubicacion: string) => (await withTenant(x.t, (tx) => existencias(tx))).get(`${articulo}|${ubicacion}`) ?? 0;
let A: Ctx, B: Ctx;

beforeAll(async () => { A = await crearTenant("ia"); B = await crearTenant("ib"); });
afterAll(async () => { await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } }); await prisma.$disconnect(); });

describe("ubicaciones", () => {
  it("hay un almacén principal y una ubicación por embarcación, sin duplicarse al repetir", async () => {
    await withTenant(A.t, (tx) => asegurarUbicaciones(tx, A.t));
    const ubs = await withTenant(A.t, (tx) => tx.ubicacion.findMany({ orderBy: { nombre: "asc" } }));
    expect(ubs.map((u) => [u.nombre, u.tipo])).toEqual([["Alfa", "EMBARCACION"], ["Almacén principal", "ALMACEN"]]);
  });
  it("una embarcación nueva recibe su ubicación; un nombre repetido se distingue", async () => {
    await withTenant(A.t, (tx) => tx.embarcacion.create({ data: { tenantId: A.t, nombre: "Almacén principal", tipo: "LANCHA", capacidad: 4 } }));
    await withTenant(A.t, (tx) => asegurarUbicaciones(tx, A.t));
    const nombres = (await withTenant(A.t, (tx) => tx.ubicacion.findMany())).map((u) => u.nombre);
    expect(nombres).toContain("Almacén principal (embarcación)");
    await expect(withTenant(A.t, (tx) => crearAlmacen(tx, A.t, "Alfa"))).rejects.toThrow(/ese nombre/);
  });
});

describe("compras", () => {
  it("con cuenta crea el gasto, baja el saldo y calcula el costo por unidad", async () => {
    const antes = await withTenant(A.t, (tx) => saldoCuenta(tx, A.cuenta));
    const m = await compra(A); // 10 bolsas por $500 = $50 c/u
    expect(m).toMatchObject({ tipo: "COMPRA", cantidadMilli: 10_000, costoUnitarioCentavos: 5_000 });
    expect(await withTenant(A.t, (tx) => saldoCuenta(tx, A.cuenta))).toBe(antes - 50_000);
    const g = await withTenant(A.t, (tx) => tx.gasto.findUniqueOrThrow({ where: { id: m.gastoId! } }));
    expect(g).toMatchObject({ origen: "INVENTARIO", montoCentavos: 50_000, estado: "ACTIVO" });
    expect(await hay(A, A.hielo, A.almacen)).toBe(10_000);
  });
  it("el gasto de una compra no se cancela por la vía normal", async () => {
    const m = await compra(A, { cantidadMilli: 1_000, totalCentavos: 5_000 });
    await expect(withTenant(A.t, (tx) => cancelarGasto(tx, m.gastoId!, "u", "error"))).rejects.toThrow(/compra de inventario/);
  });
  it("sin cuenta solo entra al inventario (inventario inicial) y no toca el dinero", async () => {
    const antes = await withTenant(A.t, (tx) => saldoCuenta(tx, A.cuenta));
    const m = await compra(A, { articuloId: A.cloro, cuentaId: null, cantidadMilli: 20_000, totalCentavos: 40_000 });
    expect(m).toMatchObject({ gastoId: null, costoUnitarioCentavos: 2_000 });
    expect(await withTenant(A.t, (tx) => saldoCuenta(tx, A.cuenta))).toBe(antes);
  });
  it("valida cantidad, total, fecha, artículo y ubicación", async () => {
    await expect(compra(A, { cantidadMilli: 0 })).rejects.toThrow(/cantidad/);
    await expect(compra(A, { totalCentavos: 0 })).rejects.toThrow(/total/);
    await expect(compra(A, { fecha: "2031-02-31" })).rejects.toThrow(/Fecha/);
    await expect(compra(A, { articuloId: B.hielo })).rejects.toThrow(/no existe/); // artículo de otra empresa (RLS)
    await expect(compra(A, { ubicacionId: B.almacen })).rejects.toThrow(/no existe/);
  });
});

describe("salidas y existencias", () => {
  it("no deja la existencia en negativo y dice cuánto hay", async () => {
    const h = await hay(A, A.hielo, A.almacen);
    await expect(consumo(A, h + 1)).rejects.toThrow(/solo hay/);
    await consumo(A, 2_500);
    expect(await hay(A, A.hielo, A.almacen)).toBe(h - 2_500);
  });
  it("la merma pide motivo", async () => {
    await expect(withTenant(A.t, (tx) => registrarMerma(tx, A.t, { articuloId: A.hielo, ubicacionId: A.almacen, cantidadMilli: 500, fecha: F }))).rejects.toThrow(/motivo/);
    const antes = await hay(A, A.hielo, A.almacen);
    await withTenant(A.t, (tx) => registrarMerma(tx, A.t, { articuloId: A.hielo, ubicacionId: A.almacen, cantidadMilli: 500, fecha: F, notas: "Se derritió" }));
    expect(await hay(A, A.hielo, A.almacen)).toBe(antes - 500);
  });
  it("dos consumos simultáneos no pueden gastar la misma existencia", async () => {
    const C = await crearTenant("ic");
    await compra(C, { cantidadMilli: 5_000, totalCentavos: 10_000 });
    const r = await Promise.allSettled([consumo(C, 3_000), consumo(C, 3_000), consumo(C, 3_000)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await hay(C, C.hielo, C.almacen)).toBe(2_000);
  });
});

describe("traspasos", () => {
  it("mueve existencia entre ubicaciones con dos movimientos ligados, y exige que haya", async () => {
    const T = await crearTenant("it");
    await compra(T, { cantidadMilli: 10_000, totalCentavos: 20_000 });
    await expect(withTenant(T.t, (tx) => traspasar(tx, T.t, { articuloId: T.hielo, origenId: T.almacen, destinoId: T.barco, cantidadMilli: 12_000, fecha: F }))).rejects.toThrow(/solo hay/);
    await expect(withTenant(T.t, (tx) => traspasar(tx, T.t, { articuloId: T.hielo, origenId: T.almacen, destinoId: T.almacen, cantidadMilli: 1_000, fecha: F }))).rejects.toThrow(/distintos/);
    const { grupoId } = await withTenant(T.t, (tx) => traspasar(tx, T.t, { articuloId: T.hielo, origenId: T.almacen, destinoId: T.barco, cantidadMilli: 4_000, fecha: F }));
    expect(await hay(T, T.hielo, T.almacen)).toBe(6_000);
    expect(await hay(T, T.hielo, T.barco)).toBe(4_000);
    expect(await withTenant(T.t, (tx) => tx.movimientoInventario.count({ where: { grupoId } }))).toBe(2);
    // el consumo se registra donde se gastó
    await consumo(T, 1_500, T.barco);
    expect(await hay(T, T.hielo, T.barco)).toBe(2_500);
  });
  it("anular un traspaso revierte ambas mitades, salvo que ya se haya usado lo recibido", async () => {
    const T = await crearTenant("iu");
    await compra(T, { cantidadMilli: 10_000, totalCentavos: 20_000 });
    const { grupoId } = await withTenant(T.t, (tx) => traspasar(tx, T.t, { articuloId: T.hielo, origenId: T.almacen, destinoId: T.barco, cantidadMilli: 4_000, fecha: F }));
    await consumo(T, 3_000, T.barco);
    const salida = (await withTenant(T.t, (tx) => tx.movimientoInventario.findFirst({ where: { grupoId, tipo: "TRASPASO_SALIDA" } })))!;
    await expect(withTenant(T.t, (tx) => anularMovimiento(tx, salida.id, "me equivoqué"))).rejects.toThrow(/ya se usó/);
    await consumo(T, 1_000, T.barco); // el barco queda en cero... y aun así sigue sin poder revertirse
    expect(await hay(T, T.hielo, T.barco)).toBe(0);
  });
});

describe("anular compras y movimientos", () => {
  it("anular una compra cancela su gasto y quita la existencia, si no se ha usado", async () => {
    const T = await crearTenant("iv");
    const antes = await withTenant(T.t, (tx) => saldoCuenta(tx, T.cuenta));
    const m = await compra(T, { cantidadMilli: 8_000, totalCentavos: 16_000 });
    await consumo(T, 3_000);
    await expect(withTenant(T.t, (tx) => anularMovimiento(tx, m.id, "error de captura"))).rejects.toThrow(/ya se usó/);
    const gasto = await withTenant(T.t, (tx) => tx.gasto.findUniqueOrThrow({ where: { id: m.gastoId! } }));
    expect(gasto.estado).toBe("ACTIVO"); // nada se movió
    const c = (await withTenant(T.t, (tx) => tx.movimientoInventario.findFirst({ where: { tipo: "CONSUMO" } })))!;
    await withTenant(T.t, (tx) => anularMovimiento(tx, c.id, "se capturó de más")); // devuelve lo consumido
    expect(await hay(T, T.hielo, T.almacen)).toBe(8_000);
    await withTenant(T.t, (tx) => anularMovimiento(tx, m.id, "error de captura"));
    expect(await hay(T, T.hielo, T.almacen)).toBe(0);
    expect((await withTenant(T.t, (tx) => tx.gasto.findUniqueOrThrow({ where: { id: m.gastoId! } }))).estado).toBe("CANCELADO");
    expect(await withTenant(T.t, (tx) => saldoCuenta(tx, T.cuenta))).toBe(antes);
    await expect(withTenant(T.t, (tx) => anularMovimiento(tx, m.id, "otra vez"))).rejects.toThrow(/ya está anulado/);
    await expect(withTenant(T.t, (tx) => anularMovimiento(tx, c.id, "x"))).rejects.toThrow(/ya está anulado|motivo/);
  });
  it("una compra cuyo gasto ya se concilió con el banco no se anula", async () => {
    const T = await crearTenant("iw");
    const m = await compra(T, { cantidadMilli: 2_000, totalCentavos: 4_000 });
    const linea = await withTenant(T.t, (tx) => tx.movimientoBanco.create({ data: { tenantId: T.t, cuentaId: T.cuenta, fecha: new Date("2031-04-10"), descripcion: "HIELERA", montoCentavos: -4_000, huella: `h-${sfx}`, estado: "CONCILIADA", gastoId: m.gastoId } }));
    expect(linea.estado).toBe("CONCILIADA");
    await expect(withTenant(T.t, (tx) => anularMovimiento(tx, m.id, "error"))).rejects.toThrow(/conciliado/);
    expect(await hay(T, T.hielo, T.almacen)).toBe(2_000);
  });
});

describe("conteo físico", () => {
  it("registra solo las diferencias como ajustes y deja la existencia igual a lo contado", async () => {
    const T = await crearTenant("ix");
    await compra(T, { cantidadMilli: 10_000, totalCentavos: 20_000 });
    await compra(T, { articuloId: T.cloro, cantidadMilli: 5_000, totalCentavos: 10_000 });
    const r = await withTenant(T.t, (tx) => registrarConteo(tx, T.t, { ubicacionId: T.almacen, fecha: F, lineas: [{ articuloId: T.hielo, contadoMilli: 9_000 }, { articuloId: T.cloro, contadoMilli: 5_000 }] }));
    expect(r.ajustes).toEqual([{ articuloId: T.hielo, diferenciaMilli: -1_000 }]); // el cloro cuadra y no genera ajuste
    expect(await hay(T, T.hielo, T.almacen)).toBe(9_000);
    const sobrante = await withTenant(T.t, (tx) => registrarConteo(tx, T.t, { ubicacionId: T.almacen, fecha: F, lineas: [{ articuloId: T.cloro, contadoMilli: 5_500 }] }));
    expect(sobrante.ajustes[0].diferenciaMilli).toBe(500);
    expect(await hay(T, T.cloro, T.almacen)).toBe(5_500);
    await expect(withTenant(T.t, (tx) => registrarConteo(tx, T.t, { ubicacionId: T.almacen, fecha: F, lineas: [{ articuloId: T.hielo, contadoMilli: -1 }] }))).rejects.toThrow(/inválida/);
  });
});

describe("resumen, valor y reabastecimiento", () => {
  it("existencia total y por ubicación, costo promedio ponderado, valor y alerta de mínimo", async () => {
    const T = await crearTenant("iy");
    await compra(T, { cantidadMilli: 10_000, totalCentavos: 10_000 }); // 10 u por $100 = $10 c/u
    await compra(T, { cantidadMilli: 30_000, totalCentavos: 42_000 }); // 30 u por $420 = $14 c/u
    await withTenant(T.t, (tx) => traspasar(tx, T.t, { articuloId: T.hielo, origenId: T.almacen, destinoId: T.barco, cantidadMilli: 5_000, fecha: F }));
    await consumo(T, 33_000);
    const { articulos, valorTotalCentavos } = await withTenant(T.t, (tx) => resumenInventario(tx));
    const h = articulos.find((a) => a.nombre === "Hielo")!;
    expect(h.totalMilli).toBe(7_000);
    expect(h.porUbicacion.get(T.barco)).toBe(5_000);
    expect(h.porUbicacion.get(T.almacen)).toBe(2_000);
    expect(h.costoPromedioCentavos).toBe(1_300); // ($100 + $420) / 40 u = $13
    expect(h.valorCentavos).toBe(9_100); // 7 u × $13
    expect(valorTotalCentavos).toBe(9_100);
    expect(h.reabastecer).toBe(false); // mínimo 5 y hay 7
    await consumo(T, 3_000, T.barco);
    expect(await withTenant(T.t, (tx) => contarPorReabastecer(tx))).toBe(1); // quedan 4 < 5
  });
  it("un artículo anulado deja de contar y un artículo inactivo no pide reabastecer", async () => {
    const T = await crearTenant("iz");
    await withTenant(T.t, (tx) => tx.articulo.update({ where: { id: T.hielo }, data: { activo: false } }));
    expect(await withTenant(T.t, (tx) => contarPorReabastecer(tx))).toBe(0);
    await expect(compra(T)).rejects.toThrow(/inactivo/);
  });
  it("aislamiento: una empresa no ve existencias ni artículos de otra (RLS)", async () => {
    await compra(B, { cantidadMilli: 7_000, totalCentavos: 7_000 });
    const mios = await withTenant(A.t, (tx) => resumenInventario(tx));
    expect(mios.articulos.every((a) => a.id !== B.hielo)).toBe(true);
    expect(await hay(A, B.hielo, B.almacen)).toBe(0);
  });
});
