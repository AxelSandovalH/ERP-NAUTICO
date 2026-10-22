import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { aDate } from "@/lib/fechas";
import { crearReservaTx } from "@/lib/reservas/crear";
import { asegurarCategoriasBase, saldoCuenta } from "@/lib/finanzas/servicio";
import {
  cambiarEstadoSalida, cambiarPaxReserva, cancelarReservaActividad, detalleSalida, editarSalida, eliminarPagoActividad, guardarActividad, programarSalida, registrarPagoActividad,
  reservarActividad, salidasAgenda,
} from "@/lib/actividades/servicio";

// Requiere Postgres local migrado (npm run test:db lo prepara).
const sfx = Math.random().toString(36).slice(2, 8);
type Ctx = { t: string; barco: string; actividad: string; cliente: string; guia: string; guia2: string; caja: string; banco: string };
const F = "2031-07-10";

async function crearTenant(nombre: string): Promise<Ctx> {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}`, moneda: "MXN" } });
  return withTenant(t.id, async (tx) => {
    await asegurarCategoriasBase(tx, t.id);
    const barco = await tx.embarcacion.create({ data: { tenantId: t.id, nombre: "Catamarán", tipo: "CATAMARAN", capacidad: 12 } });
    const cliente = await tx.cliente.create({ data: { tenantId: t.id, nombre: "Laura Gómez" } });
    const guia = await tx.tripulante.create({ data: { tenantId: t.id, nombre: "Mario", rol: "GUIA" } });
    const guia2 = await tx.tripulante.create({ data: { tenantId: t.id, nombre: "Sofía", rol: "GUIA" } });
    const caja = await tx.cuenta.create({ data: { tenantId: t.id, nombre: "Caja", tipo: "EFECTIVO", moneda: "MXN" } });
    const banco = await tx.cuenta.create({ data: { tenantId: t.id, nombre: "Banco", tipo: "BANCO", moneda: "MXN" } });
    await tx.configFinanzas.upsert({ where: { tenantId: t.id }, update: {}, create: { tenantId: t.id, cuentaEfectivoId: caja.id, cuentaTarjetaId: banco.id, cuentaTransferenciaId: banco.id } });
    const a = await guardarActividad(tx, t.id, null, { nombre: "Snorkel", duracionMin: 240, precioCentavos: 100_000, cupo: 10 });
    return { t: t.id, barco: barco.id, actividad: a.id, cliente: cliente.id, guia: guia.id, guia2: guia2.id, caja: caja.id, banco: banco.id };
  });
}
const salida = (x: Ctx, o: Partial<Parameters<typeof programarSalida>[2]> = {}) => withTenant(x.t, (tx) => programarSalida(tx, x.t, { actividadId: x.actividad, fecha: F, inicioMin: 540, ...o }));
const reservar = (x: Ctx, salidaId: string, pax: number) => withTenant(x.t, (tx) => reservarActividad(tx, x.t, { salidaId, pax, clienteId: x.cliente }));
let A: Ctx, B: Ctx;

beforeAll(async () => { A = await crearTenant("aa"); B = await crearTenant("ab"); });
afterAll(async () => { await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } }); await prisma.$disconnect(); });

describe("catálogo y salidas", () => {
  it("valida la actividad y no permite nombres repetidos", async () => {
    await expect(withTenant(A.t, (tx) => guardarActividad(tx, A.t, null, { nombre: "Snorkel", duracionMin: 60, precioCentavos: 1, cupo: 1 }))).rejects.toThrow(/ese nombre/);
    await expect(withTenant(A.t, (tx) => guardarActividad(tx, A.t, null, { nombre: "Buceo", duracionMin: 60, precioCentavos: 1, cupo: 0 }))).rejects.toThrow(/cupo/);
  });
  it("programa una salida con el fin, el cupo y el precio de la actividad", async () => {
    const s = await salida(A, { inicioMin: 480 });
    expect(s).toMatchObject({ inicioMin: 480, finMin: 720, cupo: 10, precioCentavos: 100_000, estado: "PROGRAMADA" });
    const ag = await withTenant(A.t, (tx) => salidasAgenda(tx, F, 3));
    expect(ag.map((x) => x.id)).toContain(s.id);
    expect(ag.find((x) => x.id === s.id)).toMatchObject({ ocupados: 0, libres: 10 });
  });
  it("rechaza actividades inactivas, ajenas y horarios inválidos", async () => {
    await expect(salida(A, { actividadId: B.actividad })).rejects.toThrow(/no existe/); // RLS
    await expect(salida(A, { inicioMin: 1300 })).rejects.toThrow(/mismo día/);
    await expect(salida(A, { fecha: "2031-02-31" })).rejects.toThrow(/Fecha/);
  });
});

describe("la embarcación y el guía", () => {
  it("una salida con embarcación la ocupa: no deja empalmar otra salida ni una renta", async () => {
    const F2 = "2031-07-12";
    const s = await salida(A, { fecha: F2, inicioMin: 600, embarcacionId: A.barco });
    await expect(salida(A, { fecha: F2, inicioMin: 700, embarcacionId: A.barco })).rejects.toThrow(/ya tiene la actividad/);
    await expect(withTenant(A.t, (tx) => crearReservaTx(tx, { tenantId: A.t, embarcacionId: A.barco, clienteId: A.cliente, fecha: F2, inicioMin: 660, finMin: 780, pax: 4, origen: "DIRECTO", totalCentavos: 100 }))).rejects.toThrow(/actividad/);
    // fuera del horario sí se puede rentar
    await withTenant(A.t, (tx) => crearReservaTx(tx, { tenantId: A.t, embarcacionId: A.barco, clienteId: A.cliente, fecha: F2, inicioMin: 900, finMin: 1000, pax: 4, origen: "DIRECTO", totalCentavos: 100 }));
    // y al cancelar la salida el barco se libera
    await withTenant(A.t, (tx) => cambiarEstadoSalida(tx, s.id, "CANCELADA"));
    await salida(A, { fecha: F2, inicioMin: 600, embarcacionId: A.barco });
  });
  it("una salida no puede empalmarse con una renta ni con un bloqueo", async () => {
    const F3 = "2031-07-14";
    await withTenant(A.t, (tx) => crearReservaTx(tx, { tenantId: A.t, embarcacionId: A.barco, clienteId: A.cliente, fecha: F3, inicioMin: 600, finMin: 840, pax: 4, origen: "DIRECTO", totalCentavos: 100 }));
    await expect(salida(A, { fecha: F3, inicioMin: 700, embarcacionId: A.barco })).rejects.toThrow(/ya tiene una reserva/);
    await withTenant(A.t, (tx) => tx.bloqueoEmbarcacion.create({ data: { tenantId: A.t, embarcacionId: A.barco, desde: aDate("2031-07-15"), hasta: aDate("2031-07-15"), motivo: "Mantenimiento" } }));
    await expect(salida(A, { fecha: "2031-07-15", inicioMin: 540, embarcacionId: A.barco })).rejects.toThrow(/bloqueada/);
  });
  it("el cupo no puede pasar de la capacidad de la embarcación", async () => {
    await expect(salida(A, { fecha: "2031-07-16", cupo: 30, embarcacionId: A.barco })).rejects.toThrow(/máximo 12/);
  });
  it("un guía no puede tener dos salidas a la vez", async () => {
    const F4 = "2031-07-18";
    await salida(A, { fecha: F4, inicioMin: 540, guiaId: A.guia });
    await expect(salida(A, { fecha: F4, inicioMin: 600, guiaId: A.guia })).rejects.toThrow(/otra salida/);
    await salida(A, { fecha: F4, inicioMin: 600, guiaId: A.guia2 });
  });
});

describe("reservas por persona y cupo", () => {
  it("respeta el cupo, libera lugares al cancelar y comparte el folio con las rentas", async () => {
    const s = await salida(A, { fecha: "2031-07-20", cupo: 5 });
    const r1 = await reservar(A, s.id, 3);
    expect(r1).toMatchObject({ pax: 3, totalCentavos: 300_000, estado: "CONFIRMADA" });
    await expect(reservar(A, s.id, 3)).rejects.toThrow(/Solo quedan 2 lugares/);
    const r2 = await reservar(A, s.id, 2);
    await expect(reservar(A, s.id, 1)).rejects.toThrow(/llena/);
    expect(r2.folio).toBeGreaterThan(r1.folio);
    await withTenant(A.t, (tx) => cancelarReservaActividad(tx, r1.id));
    expect((await withTenant(A.t, (tx) => detalleSalida(tx, s.id)))?.libres).toBe(3);
    await reservar(A, s.id, 3);
  });
  it("reservas simultáneas no pasan del cupo", async () => {
    const s = await salida(A, { fecha: "2031-07-21", cupo: 8 });
    const r = await Promise.allSettled(Array.from({ length: 6 }, () => reservar(A, s.id, 2)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(4);
    expect((await withTenant(A.t, (tx) => detalleSalida(tx, s.id)))).toMatchObject({ ocupados: 8, libres: 0 });
  });
  it("cambia el número de personas respetando el cupo y lo ya pagado", async () => {
    const s = await salida(A, { fecha: "2031-07-22", cupo: 6 });
    const r = await reservar(A, s.id, 2);
    await reservar(A, s.id, 3);
    await expect(withTenant(A.t, (tx) => cambiarPaxReserva(tx, r.id, 4))).rejects.toThrow(/Solo quedan 3 lugares/);
    const ok = await withTenant(A.t, (tx) => cambiarPaxReserva(tx, r.id, 3));
    expect(ok.totalCentavos).toBe(300_000);
    await withTenant(A.t, (tx) => registrarPagoActividad(tx, A.t, { reservaId: r.id, montoCentavos: 300_000, metodo: "EFECTIVO" }));
    await expect(withTenant(A.t, (tx) => cambiarPaxReserva(tx, r.id, 1))).rejects.toThrow(/menor a lo ya pagado/);
  });
  it("no deja reservar en una salida ajena, cancelada o completada", async () => {
    const sB = await withTenant(B.t, (tx) => programarSalida(tx, B.t, { actividadId: B.actividad, fecha: F, inicioMin: 540 }));
    await expect(reservar(A, sB.id, 1)).rejects.toThrow(/no existe/); // RLS
    const s = await salida(A, { fecha: "2031-07-23" });
    await withTenant(A.t, (tx) => cambiarEstadoSalida(tx, s.id, "CANCELADA"));
    await expect(reservar(A, s.id, 1)).rejects.toThrow(/cancelada/);
    const s2 = await salida(A, { fecha: "2031-07-24" });
    await withTenant(A.t, (tx) => cambiarEstadoSalida(tx, s2.id, "COMPLETADA"));
    await expect(reservar(A, s2.id, 1)).rejects.toThrow(/ya se realizó/);
  });
  it("crea al cliente cuando se escribe su nombre", async () => {
    const s = await salida(A, { fecha: "2031-07-25" });
    const r = await withTenant(A.t, (tx) => reservarActividad(tx, A.t, { salidaId: s.id, pax: 2, cliente: { nombre: "John Miller", telefono: "555" } }));
    const c = await withTenant(A.t, (tx) => tx.cliente.findUnique({ where: { id: r.clienteId } }));
    expect(c).toMatchObject({ nombre: "John Miller", telefono: "555" });
    await expect(withTenant(A.t, (tx) => reservarActividad(tx, A.t, { salidaId: s.id, pax: 1, cliente: { nombre: " " } }))).rejects.toThrow(/cliente/);
  });
});

describe("pagos e ingresos", () => {
  it("cada pago genera su ingreso en la cuenta del método; eliminarlo lo cancela", async () => {
    const s = await salida(A, { fecha: "2031-08-01", cupo: 6 });
    const r = await reservar(A, s.id, 2); // $2,000
    const antesCaja = await withTenant(A.t, (tx) => saldoCuenta(tx, A.caja));
    const p1 = await withTenant(A.t, (tx) => registrarPagoActividad(tx, A.t, { reservaId: r.id, montoCentavos: 50_000, metodo: "EFECTIVO" }));
    expect(p1.ingresoCreado).toBe(true);
    const ing = await withTenant(A.t, (tx) => tx.ingreso.findUnique({ where: { pagoActividadId: p1.pago.id } }));
    expect(ing).toMatchObject({ origen: "ACTIVIDAD", estado: "ACTIVO", cuentaId: A.caja, montoCentavos: 50_000 });
    expect(ing?.concepto).toContain(`Actividad #${r.folio}`);
    expect(await withTenant(A.t, (tx) => saldoCuenta(tx, A.caja))).toBe(antesCaja + 50_000);
    await withTenant(A.t, (tx) => registrarPagoActividad(tx, A.t, { reservaId: r.id, montoCentavos: 150_000, metodo: "TRANSFERENCIA" }));
    const d = await withTenant(A.t, (tx) => detalleSalida(tx, s.id));
    expect(d?.reservas[0]).toMatchObject({ pagado: 200_000, cobro: "LIQUIDADA" });
    await expect(withTenant(A.t, (tx) => registrarPagoActividad(tx, A.t, { reservaId: r.id, montoCentavos: 1, metodo: "EFECTIVO" }))).rejects.toThrow(/mayor al saldo/);
    await withTenant(A.t, (tx) => eliminarPagoActividad(tx, p1.pago.id));
    expect((await withTenant(A.t, (tx) => tx.ingreso.findUnique({ where: { id: ing!.id } })))?.estado).toBe("CANCELADO");
    expect(await withTenant(A.t, (tx) => saldoCuenta(tx, A.caja))).toBe(antesCaja);
  });
  it("no deja cancelar una reserva o una salida con pagos", async () => {
    const s = await salida(A, { fecha: "2031-08-02" });
    const r = await reservar(A, s.id, 1);
    const p = await withTenant(A.t, (tx) => registrarPagoActividad(tx, A.t, { reservaId: r.id, montoCentavos: 10_000, metodo: "EFECTIVO" }));
    await expect(withTenant(A.t, (tx) => cancelarReservaActividad(tx, r.id))).rejects.toThrow(/pagos/);
    await expect(withTenant(A.t, (tx) => cambiarEstadoSalida(tx, s.id, "CANCELADA"))).rejects.toThrow(/pagos/);
    await withTenant(A.t, (tx) => eliminarPagoActividad(tx, p.pago.id));
    await withTenant(A.t, (tx) => cambiarEstadoSalida(tx, s.id, "CANCELADA"));
    expect((await withTenant(A.t, (tx) => detalleSalida(tx, s.id)))?.reservas[0].estado).toBe("CANCELADA");
  });
  it("sin cuenta configurada el pago se guarda pero avisa que no tiene ingreso", async () => {
    const C = await crearTenant("ac");
    await withTenant(C.t, (tx) => tx.configFinanzas.update({ where: { tenantId: C.t }, data: { cuentaEfectivoId: null } }));
    const s = await withTenant(C.t, (tx) => programarSalida(tx, C.t, { actividadId: C.actividad, fecha: F, inicioMin: 540 }));
    const r = await withTenant(C.t, (tx) => reservarActividad(tx, C.t, { salidaId: s.id, pax: 1, clienteId: C.cliente }));
    const p = await withTenant(C.t, (tx) => registrarPagoActividad(tx, C.t, { reservaId: r.id, montoCentavos: 10_000, metodo: "EFECTIVO" }));
    expect(p.ingresoCreado).toBe(false);
  });
});

describe("edición de salidas", () => {
  it("no baja el cupo por debajo de lo apartado y revalida el horario", async () => {
    const s = await salida(A, { fecha: "2031-08-05", cupo: 6, embarcacionId: A.barco, inicioMin: 540 });
    await reservar(A, s.id, 4);
    await expect(withTenant(A.t, (tx) => editarSalida(tx, s.id, { cupo: 3 }))).rejects.toThrow(/4 lugares/);
    const ed = await withTenant(A.t, (tx) => editarSalida(tx, s.id, { inicioMin: 600, cupo: 8, precioCentavos: 90_000 }));
    expect(ed).toMatchObject({ inicioMin: 600, finMin: 840, cupo: 8, precioCentavos: 90_000 });
    // las reservas ya hechas conservan su precio
    expect((await withTenant(A.t, (tx) => detalleSalida(tx, s.id)))?.reservas[0].precioUnitarioCentavos).toBe(100_000);
    const otra = await salida(A, { fecha: "2031-08-05", inicioMin: 900, embarcacionId: A.barco });
    await expect(withTenant(A.t, (tx) => editarSalida(tx, otra.id, { inicioMin: 700 }))).rejects.toThrow(/ya tiene la actividad/);
  });
});
