import { describe, expect, it } from "vitest";
import { calcularComision, costoBase, elegirRegla, periodoDe, repartirAbono, type Regla } from "./calcular";

const regla = (o: Partial<Regla>): Regla => ({
  id: "r", embarcacionId: null, origen: null, tipo: "FIJO", valor: 0, umbralPax: null, valorAlto: null, creadoEn: new Date("2026-01-01"), ...o,
});
const SIN_CASA = { precioCasaCentavos: null, paxIncluidosCasa: null, extraPaxCasaCentavos: null };
const CASA = { precioCasaCentavos: 2_000_000, paxIncluidosCasa: 10, extraPaxCasaCentavos: 100_000 };

describe("elegirRegla", () => {
  const ctx = { embarcacionId: "b1", origen: "WEB" };
  it("sin reglas aplicables → null", () => {
    expect(elegirRegla([], ctx)).toBeNull();
    expect(elegirRegla([regla({ id: "x", embarcacionId: "b2" })], ctx)).toBeNull();
    expect(elegirRegla([regla({ id: "x", origen: "AGENCIA" })], ctx)).toBeNull();
  });
  it("el origen pesa más que la embarcación, y ambos más que la general", () => {
    const general = regla({ id: "g" });
    const barco = regla({ id: "b", embarcacionId: "b1" });
    const origen = regla({ id: "o", origen: "WEB" });
    const ambos = regla({ id: "a", origen: "WEB", embarcacionId: "b1" });
    expect(elegirRegla([general, barco, origen, ambos], ctx)?.id).toBe("a");
    expect(elegirRegla([general, barco, origen], ctx)?.id).toBe("o");
    expect(elegirRegla([general, barco], ctx)?.id).toBe("b");
    expect(elegirRegla([general], ctx)?.id).toBe("g");
  });
  it("empate → la más reciente", () => {
    const vieja = regla({ id: "v", creadoEn: new Date("2026-01-01") });
    const nueva = regla({ id: "n", creadoEn: new Date("2026-06-01") });
    expect(elegirRegla([vieja, nueva], ctx)?.id).toBe("n");
  });
});

describe("calcularComision", () => {
  const base = { totalCentavos: 3_800_000, pax: 8, casa: CASA };
  it("sin regla → 0 con advertencia", () => {
    const r = calcularComision(null, base);
    expect(r.montoCentavos).toBe(0);
    expect(r.advertencia).toBeTruthy();
  });
  it("FIJO y SIN", () => {
    expect(calcularComision(regla({ tipo: "FIJO", valor: 50_000 }), base).montoCentavos).toBe(50_000);
    expect(calcularComision(regla({ tipo: "SIN" }), base).montoCentavos).toBe(0);
  });
  it("PORCENTAJE en puntos base, redondeado al centavo", () => {
    expect(calcularComision(regla({ tipo: "PORCENTAJE", valor: 1250 }), base).montoCentavos).toBe(475_000); // 12.5 %
    expect(calcularComision(regla({ tipo: "PORCENTAJE", valor: 333 }), { ...base, totalCentavos: 1000 }).montoCentavos).toBe(33); // 33.3
  });
  it("umbral de pasajeros usa el valor alto", () => {
    const r = regla({ tipo: "FIJO", valor: 50_000, umbralPax: 10, valorAlto: 80_000 });
    expect(calcularComision(r, { ...base, pax: 9 }).montoCentavos).toBe(50_000);
    expect(calcularComision(r, { ...base, pax: 10 }).montoCentavos).toBe(80_000);
  });
  it("PORCENTAJE_BALANCE = % de (venta − precio casa)", () => {
    // 38,000 − 20,000 = 18,000 → 20 % = 3,600
    expect(calcularComision(regla({ tipo: "PORCENTAJE_BALANCE", valor: 2000 }), base).montoCentavos).toBe(360_000);
  });
  it("PORCENTAJE_BALANCE suma el extra por pasajero al costo", () => {
    // 12 pax: casa 20,000 + 2×1,000 = 22,000 → balance 16,000 → 20 % = 3,200
    const r = calcularComision(regla({ tipo: "PORCENTAJE_BALANCE", valor: 2000 }), { ...base, pax: 12 });
    expect(r.montoCentavos).toBe(320_000);
  });
  it("PORCENTAJE_BALANCE sin precio casa o sin balance → 0 con advertencia, nunca negativo", () => {
    const rb = regla({ tipo: "PORCENTAJE_BALANCE", valor: 2000 });
    const sinCasa = calcularComision(rb, { ...base, casa: SIN_CASA });
    expect(sinCasa.montoCentavos).toBe(0);
    expect(sinCasa.advertencia).toMatch(/precio casa/);
    const barato = calcularComision(rb, { ...base, totalCentavos: 1_500_000 });
    expect(barato.montoCentavos).toBe(0);
    expect(barato.advertencia).toBeTruthy();
  });
});

describe("costoBase", () => {
  it("null sin precio casa; extra solo sobre los incluidos", () => {
    expect(costoBase(SIN_CASA, 5)).toBeNull();
    expect(costoBase(CASA, 10)).toBe(2_000_000);
    expect(costoBase(CASA, 13)).toBe(2_300_000);
  });
});

describe("repartirAbono", () => {
  const cs = [{ id: "a", faltante: 100 }, { id: "b", faltante: 200 }, { id: "c", faltante: 300 }];
  it("cubre las más antiguas primero y deja la última parcial", () => {
    expect(repartirAbono(250, cs)).toEqual({ aplicaciones: [{ id: "a", monto: 100 }, { id: "b", monto: 150 }], sobrante: 0 });
  });
  it("cubre todo exacto", () => {
    expect(repartirAbono(600, cs).aplicaciones).toHaveLength(3);
    expect(repartirAbono(600, cs).sobrante).toBe(0);
  });
  it("detecta el exceso", () => {
    expect(repartirAbono(700, cs).sobrante).toBe(100);
  });
  it("ignora comisiones sin faltante", () => {
    expect(repartirAbono(50, [{ id: "z", faltante: 0 }, { id: "a", faltante: 100 }]).aplicaciones).toEqual([{ id: "a", monto: 50 }]);
  });
});

describe("periodoDe", () => {
  it("YYYY-MM de la fecha del tour", () => expect(periodoDe("2026-10-17")).toBe("2026-10"));
});
