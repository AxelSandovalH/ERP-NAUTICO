import { describe, expect, it } from "vitest";
import { armarMovimiento, convertir, diferenciaArqueo, saldoDe, tipoCambioValido } from "./moneda";
import { CATEGORIAS_BASE } from "./categorias-base";

describe("conversión de monedas", () => {
  it("USD→MXN multiplica y MXN→USD divide, con redondeo al centavo", () => {
    expect(convertir(10_000, "USD", "MXN", 17.5)).toBe(175_000); // $100 → $1,750
    expect(convertir(175_000, "MXN", "USD", 17.5)).toBe(10_000);
    expect(convertir(1000, "MXN", "USD", 17.3)).toBe(58); // 57.8 → 58
    expect(convertir(5000, "MXN", "MXN", 17.5)).toBe(5000);
  });
  it("validación del tipo de cambio", () => {
    expect(tipoCambioValido(17.5)).toBe(true);
    for (const x of [0, -1, NaN, Infinity, 5000, "17", null]) expect(tipoCambioValido(x)).toBe(false);
  });
});

describe("armarMovimiento", () => {
  it("misma moneda que la base: sin tipo de cambio", () => {
    expect(armarMovimiento("MXN", "MXN", 17.5, { montoCentavos: 50_000 })).toEqual({ montoCentavos: 50_000, moneda: "MXN", tipoCambio: null, montoBaseCentavos: 50_000 });
  });
  it("cuenta en USD con base MXN: calcula el equivalente en pesos con el tipo de cambio dado", () => {
    const m = armarMovimiento("USD", "MXN", 17.5, { montoCentavos: 10_000, tipoCambio: 18 });
    expect(m).toEqual({ montoCentavos: 10_000, moneda: "USD", tipoCambio: 18, montoBaseCentavos: 180_000 });
    // sin tipo de cambio propio usa el de la empresa
    expect(armarMovimiento("USD", "MXN", 17.5, { montoCentavos: 10_000 }).montoBaseCentavos).toBe(175_000);
  });
  it("desde la base: cuánto sale de una cuenta en otra moneda (p. ej. nómina en pesos pagada de una cuenta en USD)", () => {
    const m = armarMovimiento("USD", "MXN", 17.5, { montoBaseCentavos: 175_000 });
    expect(m).toMatchObject({ montoCentavos: 10_000, moneda: "USD", montoBaseCentavos: 175_000, tipoCambio: 17.5 });
    expect(armarMovimiento("MXN", "MXN", 17.5, { montoBaseCentavos: 175_000 })).toMatchObject({ montoCentavos: 175_000, tipoCambio: null });
  });
  it("base USD con cuenta en pesos", () => {
    const m = armarMovimiento("MXN", "USD", 17.5, { montoCentavos: 175_000 });
    expect(m).toMatchObject({ montoBaseCentavos: 10_000, tipoCambio: 17.5 });
  });
  it("rechaza un tipo de cambio absurdo", () => {
    expect(() => armarMovimiento("USD", "MXN", 17.5, { montoCentavos: 100, tipoCambio: 0 })).toThrow(/Tipo de cambio/);
  });
});

describe("saldo y arqueo", () => {
  it("saldo = inicial + ingresos − gastos + traspasos ± ajustes", () => {
    expect(saldoDe({ saldoInicial: 100_000, ingresos: 500_000, gastos: 200_000, traspasosEntrada: 50_000, traspasosSalida: 80_000, ajustes: -1_000 })).toBe(369_000);
    expect(saldoDe({ saldoInicial: 0, ingresos: 0, gastos: 5_000, traspasosEntrada: 0, traspasosSalida: 0, ajustes: 0 })).toBe(-5_000);
  });
  it("la diferencia del arqueo es contado − teórico", () => {
    expect(diferenciaArqueo(100_000, 98_500)).toBe(-1_500); // faltante
    expect(diferenciaArqueo(100_000, 101_000)).toBe(1_000); // sobrante
    expect(diferenciaArqueo(100_000, 100_000)).toBe(0);
  });
});

describe("categorías base", () => {
  it("claves de sistema únicas y presentes para las conexiones automáticas", () => {
    const claves = CATEGORIAS_BASE.filter((c) => c.clave).map((c) => c.clave);
    expect(new Set(claves).size).toBe(claves.length);
    expect(claves.sort()).toEqual(["COMISIONES", "NOMINA", "RESERVAS"]);
  });
  it("sin nombres repetidos dentro de un mismo tipo", () => {
    for (const tipo of ["GASTO", "INGRESO"] as const) {
      const n = CATEGORIAS_BASE.filter((c) => c.tipo === tipo).map((c) => c.nombre);
      expect(new Set(n).size).toBe(n.length);
    }
  });
});
