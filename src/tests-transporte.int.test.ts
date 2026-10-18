import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { aDate } from "@/lib/fechas";
import { crearReservaTx } from "@/lib/reservas/crear";
import { asegurarCategoriasBase, cancelarIngreso, saldoCuenta } from "@/lib/finanzas/servicio";
import { asignar, guardarPlantilla } from "@/lib/horarios/servicio";
import {
  anularCobro, cambiarEstado, guardarTraslado, guardarUnidad, misTraslados, registrarCobro, registrarGastoDeTraslado, resumenTraslado, trasladosDeReserva, trasladosDelDia,
  type EntradaTraslado,
} from "@/lib/transporte/servicio";

// Requiere Postgres local migrado (npm run test:db lo prepara).
const sfx = Math.random().toString(36).slice(2, 8);
type Ctx = { t: string; reserva: string; van: string; moto: string; ana: string; beto: string; cuenta: string; usd: string };
const F = "2031-06-10";

async function crearTenant(nombre: string): Promise<Ctx> {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}`, moneda: "MXN" } });
  return withTenant(t.id, async (tx) => {
    await asegurarCategoriasBase(tx, t.id);
    const emb = await tx.embarcacion.create({ data: { tenantId: t.id, nombre: "Alfa", tipo: "YATE", capacidad: 20 } });
    const cli = await tx.cliente.create({ data: { tenantId: t.id, nombre: "Laura Gómez", telefono: "624 000 0000" } });
    const r = await crearReservaTx(tx, { tenantId: t.id, embarcacionId: emb.id, clienteId: cli.id, fecha: F, inicioMin: 600, finMin: 780, pax: 4, origen: "DIRECTO", totalCentavos: 500_000 });
    const van = await guardarUnidad(tx, t.id, null, { nombre: "Van 1", placas: "ABC-123", capacidad: 8 });
    const moto = await guardarUnidad(tx, t.id, null, { nombre: "Sedán", capacidad: 3 });
    const ana = await tx.empleado.create({ data: { tenantId: t.id, nombre: "Ana", sueldoCentavos: 0 } });
    const beto = await tx.empleado.create({ data: { tenantId: t.id, nombre: "Beto", sueldoCentavos: 0 } });
    const cuenta = await tx.cuenta.create({ data: { tenantId: t.id, nombre: "Banco", tipo: "BANCO", moneda: "MXN", saldoInicialCentavos: 1_000_000 } });
    const usd = await tx.cuenta.create({ data: { tenantId: t.id, nombre: "Banco USD", tipo: "BANCO", moneda: "USD" } });
    return { t: t.id, reserva: r.id, van: van.id, moto: moto.id, ana: ana.id, beto: beto.id, cuenta: cuenta.id, usd: usd.id };
  });
}
const base = (x: Ctx, o: Partial<EntradaTraslado> = {}): EntradaTraslado => ({ reservaId: x.reserva, tipo: "IDA", fecha: F, horaMin: 480, duracionMin: 60, origen: "Hotel Riu", destino: "Marina Cabo", pax: 4, precioCentavos: 80_000, ...o });
const crear = (x: Ctx, o: Partial<EntradaTraslado> = {}) => withTenant(x.t, (tx) => guardarTraslado(tx, x.t, null, base(x, o)));
let A: Ctx, B: Ctx;

beforeAll(async () => { A = await crearTenant("ta"); B = await crearTenant("tb"); });
afterAll(async () => { await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } }); await prisma.$disconnect(); });

describe("unidades y traslados", () => {
  it("valida la capacidad de las unidades y los nombres repetidos", async () => {
    await expect(withTenant(A.t, (tx) => guardarUnidad(tx, A.t, null, { nombre: "Van 1", capacidad: 4 }))).rejects.toThrow(/ese nombre/);
    await expect(withTenant(A.t, (tx) => guardarUnidad(tx, A.t, null, { nombre: "Camión", capacidad: 0 }))).rejects.toThrow(/capacidad/);
  });
  it("crea un traslado ligado a la reserva y lo lista por día y por reserva", async () => {
    const t = await crear(A, { unidadId: A.van, choferId: A.ana });
    expect(t).toMatchObject({ estado: "PROGRAMADO", tipo: "IDA", pax: 4, precioCentavos: 80_000 });
    expect((await withTenant(A.t, (tx) => trasladosDelDia(tx, F))).map((x) => x.id)).toContain(t.id);
    expect((await withTenant(A.t, (tx) => trasladosDeReserva(tx, A.reserva))).map((x) => x.id)).toContain(t.id);
    expect(await withTenant(A.t, (tx) => trasladosDelDia(tx, "2031-06-11"))).toHaveLength(0);
  });
  it("rechaza datos inválidos, reservas ajenas y reservas canceladas", async () => {
    await expect(crear(A, { pax: 0 })).rejects.toThrow(/pasajeros/);
    await expect(crear(A, { fecha: "2031-02-31" })).rejects.toThrow(/Fecha/);
    await expect(crear(A, { reservaId: B.reserva })).rejects.toThrow(/no existe/); // reserva de otra empresa (RLS)
    const R = await crearTenant("tcancel");
    await withTenant(R.t, (tx) => tx.reserva.update({ where: { id: R.reserva }, data: { estado: "CANCELADA" } }));
    await expect(crear(R)).rejects.toThrow(/cancelada/);
  });
});

describe("unidades y choferes ocupados", () => {
  it("una unidad no lleva más pasajeros que su capacidad", async () => {
    await expect(crear(A, { unidadId: A.moto, pax: 4, horaMin: 900 })).rejects.toThrow(/hasta 3/);
  });
  it("no empalma la misma unidad ni el mismo chofer, pero sí permite otros o el mismo después", async () => {
    await crear(A, { unidadId: A.van, choferId: A.ana, horaMin: 1000, duracionMin: 60 });
    await expect(crear(A, { unidadId: A.van, horaMin: 1030 })).rejects.toThrow(/Van 1 ya tiene/);
    await expect(crear(A, { choferId: A.ana, horaMin: 1030 })).rejects.toThrow(/Ana ya tiene/);
    await crear(A, { unidadId: A.moto, choferId: A.beto, pax: 2, horaMin: 1030 }); // otra unidad y otro chofer
    await crear(A, { unidadId: A.van, choferId: A.ana, horaMin: 1060 }); // justo cuando termina el anterior
  });
  it("un traslado cancelado libera la unidad y el chofer", async () => {
    const t = await crear(A, { unidadId: A.van, choferId: A.beto, horaMin: 1200 });
    await expect(crear(A, { unidadId: A.van, horaMin: 1210 })).rejects.toThrow(/ya tiene/);
    await withTenant(A.t, (tx) => cambiarEstado(tx, t.id, "CANCELADO"));
    await crear(A, { unidadId: A.van, horaMin: 1210 });
    // reprogramar el cancelado choca ahora con el nuevo
    await expect(withTenant(A.t, (tx) => cambiarEstado(tx, t.id, "PROGRAMADO"))).rejects.toThrow(/ya tiene/);
  });
  it("editar un traslado no choca consigo mismo", async () => {
    const t = await crear(A, { unidadId: A.moto, pax: 1, horaMin: 1300 });
    const editado = await withTenant(A.t, (tx) => guardarTraslado(tx, A.t, t.id, base(A, { unidadId: A.moto, pax: 2, horaMin: 1310 })));
    expect(editado).toMatchObject({ pax: 2, horaMin: 1310 });
  });
  it("el chofer no puede estar de descanso o vacaciones ese día en Horarios", async () => {
    const dia = "2031-06-20";
    await withTenant(A.t, (tx) => asignar(tx, A.t, { empleadoId: A.ana, fecha: dia, valor: "VACACIONES" }));
    await expect(crear(A, { choferId: A.ana, fecha: dia })).rejects.toThrow(/Vacaciones.*Horarios/);
    // un día con turno asignado sí se puede
    const p = await withTenant(A.t, (tx) => guardarPlantilla(tx, A.t, null, { nombre: "Mañana", inicioMin: 480, finMin: 960, color: "#0ea5e9" }));
    await withTenant(A.t, (tx) => asignar(tx, A.t, { empleadoId: A.beto, fecha: dia, valor: `p:${p.id}` }));
    await crear(A, { choferId: A.beto, fecha: dia });
  });
  it("dos altas simultáneas no pueden asignar la misma unidad a la vez", async () => {
    const C = await crearTenant("tc");
    const r = await Promise.allSettled([crear(C, { unidadId: C.van, horaMin: 700 }), crear(C, { unidadId: C.van, horaMin: 710 }), crear(C, { unidadId: C.van, horaMin: 720 })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
  it("un chofer o unidad de otra empresa no existe", async () => {
    await expect(crear(A, { choferId: B.ana, horaMin: 50 })).rejects.toThrow(/chofer/);
    await expect(crear(A, { unidadId: B.van, horaMin: 50 })).rejects.toThrow(/unidad/);
  });
});

describe("cobro y gastos del traslado", () => {
  it("el cobro crea el ingreso, sube el saldo y no cambia el total de la reserva", async () => {
    const T = await crearTenant("td");
    const t = await crear(T, { precioCentavos: 80_000 });
    const antes = await withTenant(T.t, (tx) => saldoCuenta(tx, T.cuenta));
    const cobrado = await withTenant(T.t, (tx) => registrarCobro(tx, T.t, t.id, { cuentaId: T.cuenta, fecha: F }));
    expect(cobrado.ingresoId).toBeTruthy();
    expect(await withTenant(T.t, (tx) => saldoCuenta(tx, T.cuenta))).toBe(antes + 80_000);
    expect(await withTenant(T.t, (tx) => tx.ingreso.findUniqueOrThrow({ where: { id: cobrado.ingresoId! } }))).toMatchObject({ origen: "TRANSPORTE", reservaId: T.reserva, montoCentavos: 80_000 });
    expect((await withTenant(T.t, (tx) => tx.reserva.findUniqueOrThrow({ where: { id: T.reserva } }))).totalCentavos).toBe(500_000);
    await expect(withTenant(T.t, (tx) => registrarCobro(tx, T.t, t.id, { cuentaId: T.cuenta, fecha: F }))).rejects.toThrow(/ya está cobrado/);
  });
  it("el ingreso del cobro no se cancela por la vía normal; anular el cobro lo cancela y permite cobrar de nuevo", async () => {
    const T = await crearTenant("te");
    const t = await crear(T);
    const cobrado = await withTenant(T.t, (tx) => registrarCobro(tx, T.t, t.id, { cuentaId: T.cuenta, fecha: F }));
    await expect(withTenant(T.t, (tx) => cancelarIngreso(tx, cobrado.ingresoId!, "u", "error"))).rejects.toThrow(/cobro de un traslado/);
    const antes = await withTenant(T.t, (tx) => saldoCuenta(tx, T.cuenta));
    await withTenant(T.t, (tx) => anularCobro(tx, t.id));
    expect(await withTenant(T.t, (tx) => saldoCuenta(tx, T.cuenta))).toBe(antes - 80_000);
    await withTenant(T.t, (tx) => registrarCobro(tx, T.t, t.id, { cuentaId: T.cuenta, fecha: F }));
    await expect(withTenant(T.t, (tx) => anularCobro(tx, (T as Ctx & { x?: string }).x ?? "inexistente"))).rejects.toThrow(/no existe/);
  });
  it("exige precio, cuenta en la moneda de la empresa y bloquea editar el precio o cancelar con cobro", async () => {
    const T = await crearTenant("tf");
    const gratis = await crear(T, { precioCentavos: 0 });
    await expect(withTenant(T.t, (tx) => registrarCobro(tx, T.t, gratis.id, { cuentaId: T.cuenta, fecha: F }))).rejects.toThrow(/no tiene precio/);
    const t = await crear(T, { horaMin: 900 });
    await expect(withTenant(T.t, (tx) => registrarCobro(tx, T.t, t.id, { cuentaId: T.usd, fecha: F }))).rejects.toThrow(/moneda/);
    await withTenant(T.t, (tx) => registrarCobro(tx, T.t, t.id, { cuentaId: T.cuenta, fecha: F }));
    await expect(withTenant(T.t, (tx) => guardarTraslado(tx, T.t, t.id, base(T, { horaMin: 900, precioCentavos: 99_000 })))).rejects.toThrow(/anúlalo/);
    await expect(withTenant(T.t, (tx) => cambiarEstado(tx, t.id, "CANCELADO"))).rejects.toThrow(/anúlalo/);
  });
  it("los gastos del traslado calculan su resultado y los cancelados no cuentan", async () => {
    const T = await crearTenant("tg");
    const t = await crear(T, { precioCentavos: 100_000 });
    const g1 = await withTenant(T.t, (tx) => registrarGastoDeTraslado(tx, T.t, t.id, { concepto: "Gasolina del traslado", cuentaId: T.cuenta, fecha: F, montoCentavos: 30_000 }));
    await withTenant(T.t, (tx) => registrarGastoDeTraslado(tx, T.t, t.id, { concepto: "Caseta", cuentaId: T.cuenta, fecha: F, montoCentavos: 5_000 }));
    let r = (await withTenant(T.t, (tx) => resumenTraslado(tx, t.id)))!;
    expect(r).toMatchObject({ gastosCentavos: 35_000, resultadoCentavos: 65_000 });
    expect(r.gastos).toHaveLength(2);
    await withTenant(T.t, (tx) => tx.gasto.update({ where: { id: g1.id }, data: { estado: "CANCELADO" } }));
    r = (await withTenant(T.t, (tx) => resumenTraslado(tx, t.id)))!;
    expect(r).toMatchObject({ gastosCentavos: 5_000, resultadoCentavos: 95_000 });
    await expect(withTenant(T.t, (tx) => registrarGastoDeTraslado(tx, T.t, "inexistente", { concepto: "x gasto", cuentaId: T.cuenta, fecha: F, montoCentavos: 100 }))).rejects.toThrow(/no existe/);
  });
});

describe("vista del chofer", () => {
  it("solo ve sus traslados no cancelados en la ventana indicada", async () => {
    const T = await crearTenant("th");
    await crear(T, { choferId: T.ana, horaMin: 480 });
    await crear(T, { choferId: T.beto, horaMin: 540 });
    const cancelado = await crear(T, { choferId: T.ana, horaMin: 700 });
    await withTenant(T.t, (tx) => cambiarEstado(tx, cancelado.id, "CANCELADO"));
    await crear(T, { choferId: T.ana, fecha: "2031-06-12", horaMin: 480 });
    await crear(T, { choferId: T.ana, fecha: "2031-07-30", horaMin: 480 }); // fuera de la ventana
    const m = await withTenant(T.t, (tx) => misTraslados(tx, T.ana, F, 7));
    expect(m.map((x) => [x.fecha.toISOString().slice(0, 10), x.horaMin])).toEqual([[F, 480], ["2031-06-12", 480]]);
    expect(m[0].reserva.cliente).toMatchObject({ nombre: "Laura Gómez", telefono: "624 000 0000" });
  });
  it("aislamiento: una empresa no ve los traslados de otra (RLS)", async () => {
    await crear(B, { choferId: B.ana, horaMin: 60 });
    expect((await withTenant(A.t, (tx) => trasladosDelDia(tx, F))).every((x) => x.reservaId === A.reserva)).toBe(true);
    expect(aDate(F)).toBeTruthy();
  });
});
