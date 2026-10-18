import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { crearReservaTx } from "@/lib/reservas/crear";
import { asegurarCategoriasBase, cancelarGasto, registrarGasto, registrarIngreso } from "@/lib/finanzas/servicio";
import { periodoDe } from "@/lib/reportes/rangos";
import { reporteDe } from "@/lib/reportes/servicio";

// Requiere Postgres local migrado (npm run test:db lo prepara).
const sfx = Math.random().toString(36).slice(2, 8);
type Ctx = { t: string; emb1: string; emb2: string; cli: string; cuenta: string; cat: string };

async function crearTenant(nombre: string): Promise<Ctx> {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}`, moneda: "MXN" } });
  return withTenant(t.id, async (tx) => {
    await asegurarCategoriasBase(tx, t.id);
    const e1 = await tx.embarcacion.create({ data: { tenantId: t.id, nombre: "Alfa", tipo: "YATE", capacidad: 20 } });
    const e2 = await tx.embarcacion.create({ data: { tenantId: t.id, nombre: "Beta", tipo: "LANCHA", capacidad: 10 } });
    const cli = await tx.cliente.create({ data: { tenantId: t.id, nombre: "Cliente" } });
    const cuenta = await tx.cuenta.create({ data: { tenantId: t.id, nombre: "Banco", tipo: "BANCO", moneda: "MXN" } });
    const cat = await tx.categoria.findFirstOrThrow({ where: { tipo: "GASTO" } });
    return { t: t.id, emb1: e1.id, emb2: e2.id, cli: cli.id, cuenta: cuenta.id, cat: cat.id };
  });
}
const reserva = (x: Ctx, fecha: string, emb: string, total: number, origen: "DIRECTO" | "WEB" = "DIRECTO", inicio = 600) =>
  withTenant(x.t, (tx) => crearReservaTx(tx, { tenantId: x.t, embarcacionId: emb, clienteId: x.cli, fecha, inicioMin: inicio, finMin: inicio + 120, pax: 2, origen, totalCentavos: total }));
const periodo = periodoDe("tres_meses", "2031-03-20"); // ene, feb y mar 2031; anterior: oct-dic 2030 (hasta el 20 de dic)
let A: Ctx, B: Ctx;

beforeAll(async () => { A = await crearTenant("ra"); B = await crearTenant("rb"); });
afterAll(async () => { await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } }); await prisma.$disconnect(); });

describe("reporte de finanzas", () => {
  it("separa por mes, categoría y periodo anterior; ignora lo cancelado", async () => {
    const ing = (fecha: string, monto: number) => withTenant(A.t, (tx) => registrarIngreso(tx, A.t, { concepto: "Venta", cuentaId: A.cuenta, fecha, montoCentavos: monto }));
    const gas = (fecha: string, monto: number, extra: { embarcacionId?: string; categoriaId?: string } = {}) => withTenant(A.t, (tx) => registrarGasto(tx, A.t, { concepto: "Gasto", cuentaId: A.cuenta, fecha, montoCentavos: monto, ...extra }));
    await ing("2031-01-10", 100_000); await ing("2031-03-05", 250_000);
    await ing("2030-11-15", 80_000); // periodo anterior
    await ing("2030-12-28", 999_999); // entre el fin del anterior (20-dic) y el inicio: no cuenta para nadie
    await gas("2031-01-12", 30_000, { categoriaId: A.cat, embarcacionId: A.emb1 });
    await gas("2031-02-01", 20_000);
    const cancelado = await gas("2031-02-02", 77_000);
    await withTenant(A.t, (tx) => cancelarGasto(tx, cancelado.id, "u", "error de captura"));
    const r = await withTenant(A.t, (tx) => reporteDe(tx, periodo, { finanzas: true, reservas: false }));
    expect(r.ventas).toBeNull();
    expect(r.finanzas).toMatchObject({ ingresos: [100_000, 0, 250_000], gastos: [30_000, 20_000, 0], totalIngresos: 350_000, totalGastos: 50_000, utilidad: 300_000, previos: { ingresos: 80_000, gastos: 0 } });
    expect(r.finanzas!.gastosPorCategoria.reduce((s, p) => s + p.centavos, 0)).toBe(50_000);
    expect(r.finanzas!.gastosPorCategoria.some((p) => p.etiqueta === "Sin categoría" && p.centavos === 20_000)).toBe(true);
  });
  it("un tenant no ve los datos del otro (RLS)", async () => {
    await withTenant(B.t, (tx) => registrarIngreso(tx, B.t, { concepto: "Ajeno", cuentaId: B.cuenta, fecha: "2031-02-02", montoCentavos: 5_555_500 }));
    const r = await withTenant(A.t, (tx) => reporteDe(tx, periodo, { finanzas: true, reservas: true }));
    expect(r.finanzas!.totalIngresos).toBe(350_000);
  });
});

describe("reporte de ventas", () => {
  it("cuenta reservas vivas, canal, ticket promedio, por cobrar y rentabilidad por embarcación", async () => {
    const r1 = await reserva(A, "2031-02-10", A.emb1, 300_000, "WEB");
    await reserva(A, "2031-02-11", A.emb1, 100_000, "DIRECTO");
    await reserva(A, "2031-03-02", A.emb2, 200_000, "WEB");
    const cancelada = await reserva(A, "2031-03-03", A.emb2, 900_000);
    await withTenant(A.t, (tx) => tx.reserva.update({ where: { id: cancelada.id }, data: { estado: "CANCELADA" } }));
    await reserva(A, "2030-11-20", A.emb1, 50_000); // periodo anterior
    await withTenant(A.t, (tx) => tx.pago.create({ data: { tenantId: A.t, reservaId: r1.id, montoCentavos: 120_000, metodo: "EFECTIVO" } }));
    const r = await withTenant(A.t, (tx) => reporteDe(tx, periodo, { finanzas: true, reservas: true }));
    const v = r.ventas!;
    expect(v).toMatchObject({ reservas: 3, ventas: 600_000, ticketPromedio: 200_000, previos: { reservas: 1, ventas: 50_000 }, porCobrar: 480_000, porMes: [0, 400_000, 200_000] });
    expect(v.porOrigen.map((p) => [p.etiqueta, p.centavos])).toEqual([["Web", 500_000], ["Directo", 100_000]]);
    const alfa = v.porEmbarcacion.find((e) => e.nombre === "Alfa")!, beta = v.porEmbarcacion.find((e) => e.nombre === "Beta")!;
    expect(alfa).toMatchObject({ reservas: 2, ventas: 400_000, gastos: 30_000, resultado: 370_000 }); // el gasto de 30 000 se registró a Alfa en el test anterior
    expect(beta).toMatchObject({ reservas: 1, ventas: 200_000, gastos: 0, resultado: 200_000 });
    expect(v.porEmbarcacion[0].nombre).toBe("Alfa"); // ordenadas por ventas
  });
  it("sin reservas el reporte no falla y devuelve ceros", async () => {
    const vacio = await crearTenant("rc");
    const r = await withTenant(vacio.t, (tx) => reporteDe(tx, periodo, { finanzas: true, reservas: true }));
    expect(r.ventas).toMatchObject({ reservas: 0, ventas: 0, ticketPromedio: 0, porCobrar: 0, porEmbarcacion: [] });
    expect(r.finanzas).toMatchObject({ totalIngresos: 0, totalGastos: 0, utilidad: 0 });
  });
});
