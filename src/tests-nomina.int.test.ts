import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { aIso } from "@/lib/fechas";
import { ErrorAsistencia, fijarDia, registrarChecada } from "@/lib/asistencia/servicio";
import { ErrorNomina, agregarConcepto, cancelarPago, generarNominaPeriodo, generarPago, marcarPagado, quitarConcepto } from "@/lib/nomina/servicio";
import { periodoDe } from "@/lib/nomina/periodos";

// Requiere Postgres local migrado (npm run test:db lo prepara).
const sfx = Math.random().toString(36).slice(2, 8);
const ZONA = "America/Mazatlan";
const MARINA = { lat: 22.8905, lng: -109.9167 };
const EN_MARINA = { ...MARINA, precisionM: 15 };

async function crearTenant(nombre: string) {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}` } });
  await withTenant(t.id, (tx) => tx.ubicacionAsistencia.create({ data: { tenantId: t.id, nombre: "Marina", ...MARINA, radioMetros: 150 } }));
  return t.id;
}
const empleado = (t: string, o: { esquema?: "FIJO_PERIODO" | "POR_DIA"; sueldo?: number; periodicidad?: "SEMANAL" | "QUINCENAL" | "MENSUAL"; nombre?: string; activo?: boolean } = {}) =>
  withTenant(t, (tx) => tx.empleado.create({ data: { tenantId: t, nombre: o.nombre ?? "Empleado", esquema: o.esquema ?? "FIJO_PERIODO", sueldoCentavos: o.sueldo ?? 1_500_000, periodicidad: o.periodicidad ?? "QUINCENAL", activo: o.activo ?? true } }));
const checar = (t: string, empleadoId: string, ahora: Date, pos = EN_MARINA) =>
  withTenant(t, (tx) => registrarChecada(tx, t, { empleadoId, lat: pos.lat, lng: pos.lng, precisionM: pos.precisionM, zona: ZONA, ahora }));
const Q1 = periodoDe("QUINCENAL", "2025-04-05"); // 1–15 abril 2031

let A: string, B: string;
beforeAll(async () => { A = await crearTenant("na"); B = await crearTenant("nb"); });
afterAll(async () => { await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } }); await prisma.$disconnect(); });

describe("aislamiento de las tablas de nómina y asistencia (RLS)", () => {
  it("un tenant no ve empleados, checadas ni pagos del otro", async () => {
    const e = await empleado(B);
    await checar(B, e.id, new Date("2025-04-01T16:00:00Z"));
    await withTenant(B, (tx) => generarPago(tx, B, e.id, Q1));
    expect(await withTenant(A, (tx) => tx.empleado.count())).toBe(0);
    expect(await withTenant(A, (tx) => tx.checada.count())).toBe(0);
    expect(await withTenant(A, (tx) => tx.pagoNomina.count())).toBe(0);
    expect(await withTenant(A, (tx) => tx.conceptoNomina.count())).toBe(0);
    expect(await withTenant(A, (tx) => tx.ubicacionAsistencia.count())).toBe(1); // solo la suya
  });
  it("sin contexto de tenant no hay filas", async () => {
    for (const t of ["empleado", "ubicacionAsistencia", "checada", "diaAsistencia", "pagoNomina", "conceptoNomina"] as const) {
      // @ts-expect-error acceso dinámico por nombre de modelo
      expect(await prisma[t].count()).toBe(0);
    }
  });
  it("no se puede escribir con el tenantId de otro", async () => {
    await expect(withTenant(A, (tx) => tx.empleado.create({ data: { tenantId: B, nombre: "Intruso", sueldoCentavos: 1 } }))).rejects.toThrow();
  });
});

describe("checadas", () => {
  it("alterna entrada y salida, y respeta el enfriamiento de 60 s", async () => {
    const e = await empleado(A);
    const t0 = new Date("2025-04-02T16:00:00Z");
    expect((await checar(A, e.id, t0)).tipo).toBe("ENTRADA");
    await expect(checar(A, e.id, new Date(t0.getTime() + 30_000))).rejects.toBeInstanceOf(ErrorAsistencia);
    expect((await checar(A, e.id, new Date(t0.getTime() + 8 * 3600_000))).tipo).toBe("SALIDA");
    expect((await checar(A, e.id, new Date(t0.getTime() + 9 * 3600_000))).tipo).toBe("ENTRADA");
  });
  it("el día es el LOCAL del negocio, no el UTC", async () => {
    const e = await empleado(A);
    // 03:00 UTC del 2 de abril = 20:00 del 1 de abril en Los Cabos (UTC-7)
    await checar(A, e.id, new Date("2025-04-02T03:00:00Z"));
    const c = await withTenant(A, (tx) => tx.checada.findFirstOrThrow({ where: { empleadoId: e.id } }));
    expect(aIso(c.dia)).toBe("2025-04-01");
  });
  it("rechaza fuera de la geocerca y con GPS impreciso", async () => {
    const e = await empleado(A);
    await expect(checar(A, e.id, new Date("2025-04-03T16:00:00Z"), { lat: 22.9005, lng: -109.9167, precisionM: 10 })).rejects.toThrow(/Estás a \d+ m de Marina/);
    await expect(checar(A, e.id, new Date("2025-04-03T16:00:00Z"), { ...MARINA, precisionM: 900 })).rejects.toThrow(/imprecisa/);
    expect(await withTenant(A, (tx) => tx.checada.count({ where: { empleadoId: e.id } }))).toBe(0);
  });
  it("rechaza sin ubicaciones configuradas y a empleados inactivos", async () => {
    const vacio = (await prisma.tenant.create({ data: { nombre: "nv", slug: `nv-${sfx}` } })).id;
    const ev = await empleado(vacio);
    await expect(checar(vacio, ev.id, new Date())).rejects.toThrow(/ubicaciones/);
    const inactivo = await empleado(A, { activo: false });
    await expect(checar(A, inactivo.id, new Date())).rejects.toThrow(/inactivo/);
  });
  it("dos toques simultáneos crean una sola checada", async () => {
    const e = await empleado(A);
    const ahora = new Date("2025-04-04T16:00:00Z");
    const r = await Promise.allSettled([1, 2, 3].map(() => checar(A, e.id, ahora)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await withTenant(A, (tx) => tx.checada.count({ where: { empleadoId: e.id } }))).toBe(1);
  });
});

describe("nómina FIJO_PERIODO", () => {
  it("descuenta faltas, suma bonos y conserva lo capturado al recalcular", async () => {
    const e = await empleado(A, { sueldo: 1_500_000 });
    await withTenant(A, async (tx) => {
      await fijarDia(tx, A, { empleadoId: e.id, fecha: "2025-04-03", estado: "FALTA", usuarioId: "u" });
      await fijarDia(tx, A, { empleadoId: e.id, fecha: "2025-04-04", estado: "PERMISO", usuarioId: "u" });
    });
    let p = await withTenant(A, (tx) => generarPago(tx, A, e.id, Q1));
    expect(p).toMatchObject({ brutoCentavos: 1_500_000, deduccionesCentavos: 200_000, netoCentavos: 1_300_000, diasFalta: 2, diasPeriodo: 15 });
    await withTenant(A, (tx) => agregarConcepto(tx, A, p.id, { tipo: "BONO", concepto: "Bono de puntualidad", montoCentavos: 100_000 }));
    // otra falta → al recalcular cambia el descuento automático, pero el bono sigue
    await withTenant(A, (tx) => fijarDia(tx, A, { empleadoId: e.id, fecha: "2025-04-05", estado: "FALTA", usuarioId: "u" }));
    p = await withTenant(A, (tx) => generarPago(tx, A, e.id, Q1));
    expect(p).toMatchObject({ bonosCentavos: 100_000, deduccionesCentavos: 300_000, netoCentavos: 1_300_000 });
    expect(await withTenant(A, (tx) => tx.conceptoNomina.count({ where: { pagoId: p.id } }))).toBe(2); // 1 bono + 1 descuento (no se duplicó)
    expect(await withTenant(A, (tx) => tx.pagoNomina.count({ where: { empleadoId: e.id } }))).toBe(1); // idempotente
  });
  it("el ciclo: pagar, bloquear cambios, cancelar y rehacer", async () => {
    const e = await empleado(A, { sueldo: 1_000_000 });
    const p = await withTenant(A, (tx) => generarPago(tx, A, e.id, Q1));
    const pagado = await withTenant(A, (tx) => marcarPagado(tx, A, p.id, { metodo: "TRANSFERENCIA", referencia: "SPEI-1" }));
    expect(pagado).toMatchObject({ estado: "PAGADO", metodo: "TRANSFERENCIA" });
    expect(pagado.pagadoEn).toBeTruthy();
    await expect(withTenant(A, (tx) => generarPago(tx, A, e.id, Q1))).rejects.toBeInstanceOf(ErrorNomina);
    await expect(withTenant(A, (tx) => agregarConcepto(tx, A, p.id, { tipo: "BONO", concepto: "Extra", montoCentavos: 100 }))).rejects.toBeInstanceOf(ErrorNomina);
    await expect(withTenant(A, (tx) => marcarPagado(tx, A, p.id, { metodo: "EFECTIVO" }))).rejects.toBeInstanceOf(ErrorNomina);
    await withTenant(A, (tx) => cancelarPago(tx, p.id));
    const rehecho = await withTenant(A, (tx) => generarPago(tx, A, e.id, Q1));
    expect(rehecho.estado).toBe("PENDIENTE");
    expect(rehecho.pagadoEn).toBeNull();
  });
  it("validaciones de conceptos: monto positivo y los automáticos no se quitan a mano", async () => {
    const e = await empleado(A);
    await withTenant(A, (tx) => fijarDia(tx, A, { empleadoId: e.id, fecha: "2025-04-02", estado: "FALTA", usuarioId: "u" }));
    const p = await withTenant(A, (tx) => generarPago(tx, A, e.id, Q1));
    await expect(withTenant(A, (tx) => agregarConcepto(tx, A, p.id, { tipo: "BONO", concepto: "x", montoCentavos: 0 }))).rejects.toBeInstanceOf(ErrorNomina);
    const auto = await withTenant(A, (tx) => tx.conceptoNomina.findFirstOrThrow({ where: { pagoId: p.id, automatico: true } }));
    await expect(withTenant(A, (tx) => quitarConcepto(tx, auto.id))).rejects.toBeInstanceOf(ErrorNomina);
    const bono = await withTenant(A, (tx) => agregarConcepto(tx, A, p.id, { tipo: "DEDUCCION", concepto: "Anticipo", montoCentavos: 50_000 }));
    expect(bono.deduccionesCentavos).toBeGreaterThan(50_000);
  });
  it("quitar la corrección de un día lo devuelve a las checadas", async () => {
    const e = await empleado(A, { esquema: "POR_DIA", sueldo: 80_000 });
    await checar(A, e.id, new Date("2025-04-07T16:00:00Z"));
    await withTenant(A, (tx) => fijarDia(tx, A, { empleadoId: e.id, fecha: "2025-04-07", estado: "FALTA", usuarioId: "u" }));
    expect((await withTenant(A, (tx) => generarPago(tx, A, e.id, Q1))).brutoCentavos).toBe(0); // la corrección manda
    await withTenant(A, (tx) => fijarDia(tx, A, { empleadoId: e.id, fecha: "2025-04-07", estado: null, usuarioId: "u" }));
    expect((await withTenant(A, (tx) => generarPago(tx, A, e.id, Q1))).brutoCentavos).toBe(80_000);
  });
});

describe("periodos en curso", () => {
  it("los días que aún no llegan no cuentan como sin registro", async () => {
    const e = await empleado(A, { esquema: "POR_DIA", sueldo: 80_000 });
    const futuro = periodoDe("MENSUAL", "2031-04-05"); // abril de 2031: ningún día ha llegado
    const p = await withTenant(A, (tx) => generarPago(tx, A, e.id, futuro));
    expect(p).toMatchObject({ diasSinRegistro: 0, diasTrabajados: 0, brutoCentavos: 0, diasPeriodo: 30 });
  });
});

describe("nómina POR_DIA y generación por periodo", () => {
  it("paga checadas y vacaciones, no paga días sin registro, y los avisa", async () => {
    const e = await empleado(A, { esquema: "POR_DIA", sueldo: 80_000 });
    for (const d of ["2025-04-08", "2025-04-09", "2025-04-10"]) await checar(A, e.id, new Date(`${d}T16:00:00Z`));
    await withTenant(A, (tx) => fijarDia(tx, A, { empleadoId: e.id, fecha: "2025-04-11", estado: "VACACIONES", usuarioId: "u" }));
    const p = await withTenant(A, (tx) => generarPago(tx, A, e.id, Q1));
    expect(p).toMatchObject({ diasTrabajados: 4, brutoCentavos: 320_000, netoCentavos: 320_000, diasSinRegistro: 11 });
  });
  it("generarNominaPeriodo solo toma activos de esa periodicidad", async () => {
    const t = await crearTenant("gp");
    await empleado(t, { periodicidad: "QUINCENAL", nombre: "Q" });
    await empleado(t, { periodicidad: "MENSUAL", nombre: "M" });
    await empleado(t, { periodicidad: "QUINCENAL", nombre: "Baja", activo: false });
    const r = await withTenant(t, (tx) => generarNominaPeriodo(tx, t, "QUINCENAL", Q1));
    expect(r.generados).toBe(1);
    expect(await withTenant(t, (tx) => tx.pagoNomina.count())).toBe(1);
    // repetirlo no duplica
    await withTenant(t, (tx) => generarNominaPeriodo(tx, t, "QUINCENAL", Q1));
    expect(await withTenant(t, (tx) => tx.pagoNomina.count())).toBe(1);
  });
});
