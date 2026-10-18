import { describe, expect, it } from "vitest";
import { periodoDe } from "./rangos";
import { agruparPor, compacto, escalaDeEje, sumarPorMes, topConOtras, variacion } from "./agregar";

describe("periodoDe", () => {
  it("este mes llega hasta hoy y el anterior es el mes completo previo", () => {
    expect(periodoDe("este_mes", "2026-10-17")).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-17", anteriorDesde: "2026-09-01", anteriorHasta: "2026-09-17", meses: ["2026-10"] });
  });
  it("mes pasado es completo", () => {
    expect(periodoDe("mes_pasado", "2026-03-10")).toMatchObject({ desde: "2026-02-01", hasta: "2026-02-28", anteriorDesde: "2026-01-01", anteriorHasta: "2026-01-31" });
  });
  it("últimos 6 meses cruza el año y compara con los 6 anteriores", () => {
    const p = periodoDe("seis_meses", "2026-02-15");
    expect(p.meses).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(p).toMatchObject({ desde: "2025-09-01", hasta: "2026-02-15", anteriorDesde: "2025-03-01", anteriorHasta: "2025-08-15" });
  });
  it("este año empieza en enero", () => {
    const p = periodoDe("este_anio", "2026-04-05");
    expect(p.meses).toHaveLength(4);
    expect(p).toMatchObject({ anteriorDesde: "2025-09-01", anteriorHasta: "2025-12-05" }); // los 4 meses previos, hasta el mismo día
  });
  it("doce meses", () => {
    const p = periodoDe("doce_meses", "2026-10-17");
    expect(p.meses[0]).toBe("2025-11");
    expect(p.meses).toHaveLength(12);
  });
  it("las ventas miden meses completos aunque el periodo llegue solo hasta hoy", () => {
    expect(periodoDe("este_mes", "2026-10-17")).toMatchObject({ hasta: "2026-10-17", hastaMes: "2026-10-31", anteriorHastaMes: "2026-09-30" });
    expect(periodoDe("mes_pasado", "2026-03-10")).toMatchObject({ hasta: "2026-02-28", hastaMes: "2026-02-28" });
  });
  it("el día de corte se ajusta al último día del mes anterior si este es más corto", () => {
    expect(periodoDe("este_mes", "2026-03-31").anteriorHasta).toBe("2026-02-28");
  });
  it("febrero bisiesto", () => {
    expect(periodoDe("mes_pasado", "2028-03-01").hasta).toBe("2028-02-29");
  });
});

describe("agregados", () => {
  it("sumarPorMes rellena con cero los meses vacíos e ignora lo de fuera", () => {
    expect(sumarPorMes([{ fecha: "2026-01-05", montoCentavos: 100 }, { fecha: "2026-01-20", montoCentavos: 50 }, { fecha: "2026-03-01", montoCentavos: 7 }, { fecha: "2025-12-31", montoCentavos: 999 }], ["2026-01", "2026-02", "2026-03"])).toEqual([150, 0, 7]);
  });
  it("topConOtras agrupa la cola y omite lo que no es positivo", () => {
    const partes = ["a", "b", "c", "d", "e"].map((k, i) => ({ clave: k, etiqueta: k, centavos: (5 - i) * 100 }));
    expect(topConOtras(partes, 3).map((p) => [p.etiqueta, p.centavos])).toEqual([["a", 500], ["b", 400], ["c", 300], ["Otras", 300]]);
    expect(topConOtras([{ clave: "x", etiqueta: "x", centavos: 0 }, { clave: "y", etiqueta: "y", centavos: -5 }], 3)).toEqual([]);
    expect(topConOtras(partes.slice(0, 2), 3)).toHaveLength(2);
  });
  it("agruparPor suma por clave", () => {
    expect(agruparPor([{ k: "a", montoCentavos: 1 }, { k: "b", montoCentavos: 2 }, { k: "a", montoCentavos: 3 }], (f) => f.k, (k) => k.toUpperCase())).toEqual([{ clave: "a", etiqueta: "A", centavos: 4 }, { clave: "b", etiqueta: "B", centavos: 2 }]);
  });
  it("variacion", () => {
    expect(variacion(150, 100)).toBe(50);
    expect(variacion(50, 100)).toBe(-50);
    expect(variacion(10, 0)).toBeNull();
    expect(variacion(-50, -100)).toBe(50); // la pérdida se redujo a la mitad
  });
  it("escalaDeEje usa pasos redondos y a lo sumo 5 marcas", () => {
    expect(escalaDeEje(0)).toEqual({ techo: 400, paso: 100 });
    expect(escalaDeEje(4_650_000)).toEqual({ techo: 5_000_000, paso: 1_000_000 });
    expect(escalaDeEje(730)).toEqual({ techo: 800, paso: 200 });
    expect(escalaDeEje(5_000)).toEqual({ techo: 5_000, paso: 1_000 });
    expect(escalaDeEje(1_900)).toEqual({ techo: 2_000, paso: 500 });
    for (const m of [1, 37, 999, 12_345, 4_650_000, 987_654_321]) {
      const { techo, paso } = escalaDeEje(m);
      expect(techo).toBeGreaterThanOrEqual(m);
      expect(techo / paso).toBeLessThanOrEqual(5);
      expect(Number.isInteger(techo / paso)).toBe(true);
    }
  });
  it("compacto", () => {
    expect(compacto(0)).toBe("$0");
    expect(compacto(95_000)).toBe("$950");
    expect(compacto(123_400)).toBe("$1.2 mil");
    expect(compacto(1_500_000)).toBe("$15 mil");
    expect(compacto(250_000_000)).toBe("$2.5 M");
    expect(compacto(-123_400)).toBe("−$1.2 mil");
  });
});

import { csvDeReporte } from "./csv";
import type { Reporte } from "./servicio";
describe("csvDeReporte", () => {
  const r: Reporte = {
    periodo: periodoDe("tres_meses", "2026-03-15"),
    finanzas: { ingresos: [100_00, 0, 250_50], gastos: [40_00, 10_00, 0], totalIngresos: 350_50, totalGastos: 50_00, utilidad: 300_50, previos: { ingresos: 0, gastos: 0 }, gastosPorCategoria: [{ clave: "c", etiqueta: "Gasolina, diésel", centavos: 50_00 }], ingresosPorCategoria: [] },
    ventas: { reservas: 2, ventas: 500_00, ticketPromedio: 250_00, previos: { reservas: 0, ventas: 0 }, porCobrar: 100_00, porMes: [0, 0, 500_00], porOrigen: [{ clave: "WEB", etiqueta: "Web", centavos: 500_00 }], porEmbarcacion: [{ id: "e", nombre: 'Lancha "Sol"', reservas: 2, ventas: 500_00, gastos: 20_00, resultado: 480_00 }] },
  };
  const csv = csvDeReporte(r, "Mi Empresa", "MXN");
  it("incluye resumen por mes con totales y utilidad", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("2026-01,100.00,40.00,60.00");
    expect(csv).toContain("Total,350.50,50.00,300.50");
  });
  it("escapa comas y comillas", () => {
    expect(csv).toContain('"Gasolina, diésel",50.00');
    expect(csv).toContain('"Lancha ""Sol""",2,500.00,20.00,480.00');
  });
  it("omite las secciones de módulos que no se usan", () => {
    const solo = csvDeReporte({ ...r, ventas: null }, "X", "MXN");
    expect(solo).not.toContain("Ventas por canal");
    expect(solo).toContain("Gastos por categoría");
  });
});
