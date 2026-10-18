import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { asegurarCategoriasBase, cancelarGasto, cancelarIngreso, crearTraspaso, registrarGasto, registrarIngreso, saldoCuenta } from "@/lib/finanzas/servicio";
import {
  cerrarMes, conciliar, crearDesdeLinea, cuadreDelMes, desconciliar, ignorar, importarLineas, pendientesConSugerencias, reabrirMes, restaurar, saldoAl,
} from "@/lib/conciliacion/servicio";
import type { LineaBanco } from "@/lib/conciliacion/importar";

// Requiere Postgres local migrado (npm run test:db lo prepara).
const sfx = Math.random().toString(36).slice(2, 8);
type Ctx = { t: string; banco: string; otro: string; efectivo: string };

async function crearTenant(nombre: string): Promise<Ctx> {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}`, moneda: "MXN" } });
  return withTenant(t.id, async (tx) => {
    await asegurarCategoriasBase(tx, t.id);
    const mk = (n: string, tipo: "BANCO" | "EFECTIVO", ini = 0) => tx.cuenta.create({ data: { tenantId: t.id, nombre: n, tipo, moneda: "MXN", saldoInicialCentavos: ini } });
    return { t: t.id, banco: (await mk("Banco", "BANCO", 1_000_000)).id, otro: (await mk("Otro banco", "BANCO")).id, efectivo: (await mk("Caja", "EFECTIVO")).id };
  });
}
const L = (fecha: string, monto: number, descripcion: string, saldo: number | null = null): LineaBanco => ({ fecha, descripcion, montoCentavos: monto, saldoCentavos: saldo, referencia: null });
const imp = (x: Ctx, lineas: LineaBanco[], cuenta = x.banco) => withTenant(x.t, (tx) => importarLineas(tx, x.t, { cuentaId: cuenta, archivo: "estado.csv", lineas }));
const gasto = (x: Ctx, fecha: string, monto: number, concepto = "Gasolina") => withTenant(x.t, (tx) => registrarGasto(tx, x.t, { concepto, cuentaId: x.banco, fecha, montoCentavos: monto }));
const ingreso = (x: Ctx, fecha: string, monto: number, concepto = "Reserva") => withTenant(x.t, (tx) => registrarIngreso(tx, x.t, { concepto, cuentaId: x.banco, fecha, montoCentavos: monto }));
const lineas = (x: Ctx) => withTenant(x.t, (tx) => tx.movimientoBanco.findMany({ where: { cuentaId: x.banco }, orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }] }));
let A: Ctx, B: Ctx;

beforeAll(async () => { A = await crearTenant("ca"); B = await crearTenant("cb"); });
afterAll(async () => { await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } }); await prisma.$disconnect(); });

describe("importación", () => {
  it("subir dos veces el mismo archivo no duplica nada", async () => {
    const archivo = [L("2025-01-02", -50_000, "PEMEX"), L("2025-01-03", 300_000, "DEPOSITO"), L("2025-01-03", 300_000, "DEPOSITO")];
    expect(await imp(A, archivo)).toMatchObject({ filas: 3, nuevas: 3, duplicadas: 0 });
    expect(await imp(A, archivo)).toMatchObject({ nuevas: 0, duplicadas: 3 });
    expect(await lineas(A)).toHaveLength(3); // los dos depósitos idénticos del mismo día se conservan
  });
  it("un archivo que se traslapa solo agrega lo nuevo", async () => {
    expect(await imp(A, [L("2025-01-03", 300_000, "DEPOSITO"), L("2025-01-04", -1_000, "COMISION")])).toMatchObject({ nuevas: 1, duplicadas: 1 });
  });
  it("rechaza el efectivo y los archivos inválidos", async () => {
    await expect(imp(A, [L("2025-01-02", -100, "x")], A.efectivo)).rejects.toThrow(/arqueo/);
    await expect(imp(A, [{ ...L("2025-01-02", -100, "x"), montoCentavos: 0 }])).rejects.toThrow(/inválidos/);
    await expect(imp(A, [])).rejects.toThrow(/no tiene/);
  });
  it("un tenant no ve ni toca las líneas del otro (RLS)", async () => {
    await imp(B, [L("2025-01-02", -777, "ajeno")]);
    expect((await lineas(A)).some((l) => l.descripcion === "ajeno")).toBe(false);
    const ajenaId = (await lineas(B))[0].id;
    await expect(withTenant(A.t, (tx) => ignorar(tx, ajenaId))).rejects.toThrow(/no existe/);
  });
});

describe("conciliar", () => {
  it("empareja un gasto con el mismo importe y bloquea cancelarlo hasta desconciliar", async () => {
    const g = await gasto(A, "2025-02-02", 50_000);
    await imp(A, [L("2025-02-03", -50_000, "PEMEX 123")]);
    const l = (await lineas(A)).find((x) => x.descripcion === "PEMEX 123")!;
    await withTenant(A.t, (tx) => conciliar(tx, l.id, `g:${g.id}`));
    expect((await lineas(A)).find((x) => x.id === l.id)).toMatchObject({ estado: "CONCILIADA", gastoId: g.id });
    await expect(withTenant(A.t, (tx) => cancelarGasto(tx, g.id, "u", "me equivoqué"))).rejects.toThrow(/conciliado/);
    await withTenant(A.t, (tx) => desconciliar(tx, l.id));
    await withTenant(A.t, (tx) => cancelarGasto(tx, g.id, "u", "me equivoqué"));
  });
  it("no empareja importes distintos, otra cuenta ni movimientos cancelados", async () => {
    const g = await gasto(A, "2025-02-10", 12_300);
    await imp(A, [L("2025-02-10", -12_000, "OXXO")]);
    const l = (await lineas(A)).find((x) => x.descripcion === "OXXO")!;
    await expect(withTenant(A.t, (tx) => conciliar(tx, l.id, `g:${g.id}`))).rejects.toThrow(/no coincide/);
    const otro = await withTenant(A.t, (tx) => registrarGasto(tx, A.t, { concepto: "Otro banco", cuentaId: A.otro, fecha: "2025-02-10", montoCentavos: 12_000 }));
    await expect(withTenant(A.t, (tx) => conciliar(tx, l.id, `g:${otro.id}`))).rejects.toThrow(/no coincide/);
    const cancelado = await gasto(A, "2025-02-10", 12_000);
    await withTenant(A.t, (tx) => cancelarGasto(tx, cancelado.id, "u", "duplicado"));
    await expect(withTenant(A.t, (tx) => conciliar(tx, l.id, `g:${cancelado.id}`))).rejects.toThrow(/no coincide/);
  });
  it("un movimiento del sistema solo lo reclama un renglón del banco", async () => {
    const i = await ingreso(A, "2025-02-15", 80_000);
    await imp(A, [L("2025-02-15", 80_000, "SPEI 1"), L("2025-02-16", 80_000, "SPEI 2")]);
    const [a, b] = ["SPEI 1", "SPEI 2"].map((d) => lineas(A).then((ls) => ls.find((x) => x.descripcion === d)!));
    const l1 = await a, l2 = await b;
    await withTenant(A.t, (tx) => conciliar(tx, l1.id, `i:${i.id}`));
    await expect(withTenant(A.t, (tx) => conciliar(tx, l2.id, `i:${i.id}`))).rejects.toThrow(/ya está conciliado/);
    await expect(withTenant(A.t, (tx) => cancelarIngreso(tx, i.id, "u", "motivo"))).rejects.toThrow(/conciliado/);
  });
  it("un traspaso se concilia una vez en cada cuenta", async () => {
    const t = await withTenant(A.t, (tx) => crearTraspaso(tx, A.t, { origenId: A.banco, destinoId: A.otro, montoOrigenCentavos: 400_000, fecha: "2025-02-20" }));
    await imp(A, [L("2025-02-20", -400_000, "TRASPASO ENVIADO")]);
    await imp(A, [L("2025-02-20", 400_000, "TRASPASO RECIBIDO")], A.otro);
    const sale = (await lineas(A)).find((x) => x.descripcion === "TRASPASO ENVIADO")!;
    const entra = (await withTenant(A.t, (tx) => tx.movimientoBanco.findFirst({ where: { cuentaId: A.otro } })))!;
    await withTenant(A.t, (tx) => conciliar(tx, sale.id, `t:${t.id}`));
    await withTenant(A.t, (tx) => conciliar(tx, entra.id, `t:${t.id}`));
    await expect(withTenant(A.t, (tx) => conciliar(tx, sale.id, `t:${t.id}`))).rejects.toThrow();
  });
  it("crear desde el banco registra el gasto o ingreso y lo deja conciliado", async () => {
    await imp(A, [L("2025-03-01", -3_480, "COMISION MANEJO"), L("2025-03-01", 1_250, "INTERESES")]);
    const ls = await lineas(A);
    const com = ls.find((x) => x.descripcion === "COMISION MANEJO")!, int = ls.find((x) => x.descripcion === "INTERESES")!;
    const antes = await withTenant(A.t, (tx) => saldoCuenta(tx, A.banco));
    expect(await withTenant(A.t, (tx) => crearDesdeLinea(tx, A.t, com.id))).toMatch(/^g:/);
    expect(await withTenant(A.t, (tx) => crearDesdeLinea(tx, A.t, int.id))).toMatch(/^i:/);
    expect(await withTenant(A.t, (tx) => saldoCuenta(tx, A.banco))).toBe(antes - 3_480 + 1_250);
    expect((await lineas(A)).filter((x) => [com.id, int.id].includes(x.id)).every((x) => x.estado === "CONCILIADA")).toBe(true);
    await expect(withTenant(A.t, (tx) => crearDesdeLinea(tx, A.t, com.id))).rejects.toThrow(/ya está/);
  });
  it("las sugerencias proponen la pareja de importe exacto", async () => {
    const g = await gasto(A, "2025-04-02", 9_900, "Hielo");
    await imp(A, [L("2025-04-03", -9_900, "HIELO DEL PUERTO")]);
    const r = await withTenant(A.t, (tx) => pendientesConSugerencias(tx, A.banco));
    const linea = r.lineas.find((x) => x.descripcion === "HIELO DEL PUERTO")!;
    expect(r.sugerencias.get(linea.id)?.elegida).toBe(`g:${g.id}`);
  });
});

describe("tanda en una sola transacción con puntos de guardado", () => {
  it("un renglón que falla (incluso por la base de datos) se revierte solo y los demás se aplican", async () => {
    const g1 = await gasto(A, "2025-06-01", 4_100, "Tanda uno"), g2 = await gasto(A, "2025-06-02", 4_200, "Tanda dos");
    await imp(A, [L("2025-06-01", -4_100, "TANDA1"), L("2025-06-02", -4_200, "TANDA2"), L("2025-06-03", -4_300, "TANDA3")]);
    const ls = await lineas(A);
    const [l1, l2, l3] = ["TANDA1", "TANDA2", "TANDA3"].map((d) => ls.find((x) => x.descripcion === d)!);
    const resultados: string[] = [];
    await withTenant(A.t, async (tx) => {
      const paso = async (n: string, fn: () => Promise<unknown>) => {
        await tx.$executeRawUnsafe(`SAVEPOINT ${n}`);
        try { await fn(); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${n}`); resultados.push("ok"); }
        catch (e) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${n}`); resultados.push((e as { code?: string }).code ?? "error"); }
      };
      await paso("a", () => conciliar(tx, l1.id, `g:${g1.id}`));
      await paso("b", () => conciliar(tx, l3.id, `g:${g1.id}`)); // importe distinto: falla en la lógica
      await paso("c", () => tx.movimientoBanco.update({ where: { id: l3.id }, data: { gastoId: g1.id } })); // viola la unicidad en la base de datos
      await paso("d", () => conciliar(tx, l2.id, `g:${g2.id}`)); // la transacción sigue viva
    });
    expect(resultados).toEqual(["ok", "error", "P2002", "ok"]);
    const despues = await lineas(A);
    expect(despues.find((x) => x.id === l1.id)?.estado).toBe("CONCILIADA");
    expect(despues.find((x) => x.id === l2.id)?.estado).toBe("CONCILIADA");
    expect(despues.find((x) => x.id === l3.id)).toMatchObject({ estado: "PENDIENTE", gastoId: null });
  });
});

describe("ignorar y restaurar", () => {
  it("ida y vuelta", async () => {
    await imp(A, [L("2025-04-10", -500, "CARGO RARO")]);
    const l = (await lineas(A)).find((x) => x.descripcion === "CARGO RARO")!;
    await withTenant(A.t, (tx) => ignorar(tx, l.id));
    await expect(withTenant(A.t, (tx) => ignorar(tx, l.id))).rejects.toThrow();
    await withTenant(A.t, (tx) => restaurar(tx, l.id));
    expect((await lineas(A)).find((x) => x.id === l.id)?.estado).toBe("PENDIENTE");
  });
});

describe("saldo y cierre mensual", () => {
  let D: Ctx;
  beforeAll(async () => { D = await crearTenant("cc"); });
  it("saldoAl respeta la fecha de corte", async () => {
    await gasto(D, "2025-05-05", 100_000);
    await ingreso(D, "2025-05-20", 250_000);
    expect(await withTenant(D.t, (tx) => saldoAl(tx, D.banco, "2025-05-10"))).toBe(1_000_000 - 100_000);
    expect(await withTenant(D.t, (tx) => saldoAl(tx, D.banco, "2025-05-31"))).toBe(1_000_000 - 100_000 + 250_000);
  });
  it("con movimientos sin pareja, la diferencia queda explicada", async () => {
    // Banco: cobró el gasto (−1 000) y una comisión (−35); el depósito de 2 500 del sistema aún no aparece
    await imp(D, [L("2025-05-06", -100_000, "PAGO PROVEEDOR"), L("2025-05-28", -3_500, "COMISION")]);
    const ls = await lineas(D);
    const g = (await withTenant(D.t, (tx) => tx.gasto.findFirst()))!;
    await withTenant(D.t, (tx) => conciliar(tx, ls[0].id, `g:${g.id}`));
    await withTenant(D.t, (tx) => ignorar(tx, ls[1].id));
    const saldoBanco = 1_000_000 - 100_000 - 3_500;
    const c = await withTenant(D.t, (tx) => cuadreDelMes(tx, D.banco, "2025-05", saldoBanco));
    expect(c).toMatchObject({ saldoSistemaCentavos: 1_150_000, diferencia: saldoBanco - 1_150_000, sinExplicar: 0, pendientes: 0 });
    expect(c.soloSistema).toHaveLength(1);
  });
  it("no cierra con pendientes, y pide motivo si queda diferencia sin explicar", async () => {
    await imp(D, [L("2025-05-29", -700, "NUEVO")]);
    await expect(withTenant(D.t, (tx) => cerrarMes(tx, D.t, { cuentaId: D.banco, mes: "2025-05", saldoBancoCentavos: 896_500 }))).rejects.toThrow(/sin conciliar/);
    const n = (await lineas(D)).find((x) => x.descripcion === "NUEVO")!;
    await withTenant(D.t, (tx) => ignorar(tx, n.id));
    // saldo del banco con 1 peso de más que nadie explica
    await expect(withTenant(D.t, (tx) => cerrarMes(tx, D.t, { cuentaId: D.banco, mes: "2025-05", saldoBancoCentavos: 896_600 }))).rejects.toThrow(/sin explicar/);
  });
  it("cierre correcto bloquea el mes; reabrir solo el más reciente", async () => {
    const saldoBanco = 1_000_000 - 100_000 - 3_500 - 700;
    const cierre = await withTenant(D.t, (tx) => cerrarMes(tx, D.t, { cuentaId: D.banco, mes: "2025-05", saldoBancoCentavos: saldoBanco }));
    expect(cierre.sinExplicarCentavos).toBe(0);
    const ls = await lineas(D);
    await expect(withTenant(D.t, (tx) => desconciliar(tx, ls[0].id))).rejects.toThrow(/cerrado/);
    await expect(withTenant(D.t, (tx) => restaurar(tx, ls[1].id))).rejects.toThrow(/cerrado/);
    // un archivo con renglones de mayo y de junio: lo de mayo se omite
    expect(await imp(D, [L("2025-05-30", -1, "TARDE"), L("2025-06-02", -2, "JUNIO")])).toMatchObject({ nuevas: 1, fueraDePeriodo: 1 });
    await expect(withTenant(D.t, (tx) => cerrarMes(tx, D.t, { cuentaId: D.banco, mes: "2025-05", saldoBancoCentavos: 0 }))).rejects.toThrow(/ya está cerrado/);
    await expect(withTenant(D.t, (tx) => reabrirMes(tx, D.banco, "2025-04"))).rejects.toThrow(/más reciente/);
    await withTenant(D.t, (tx) => reabrirMes(tx, D.banco, "2025-05"));
    await withTenant(D.t, (tx) => desconciliar(tx, ls[0].id));
  });
  it("no se cierra un mes que no ha terminado", async () => {
    const hoy = new Date().toISOString().slice(0, 7);
    await expect(withTenant(D.t, (tx) => cerrarMes(tx, D.t, { cuentaId: D.banco, mes: hoy, saldoBancoCentavos: 0 }))).rejects.toThrow(/no termina/);
  });
});
