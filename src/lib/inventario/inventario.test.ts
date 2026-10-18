import { describe, expect, it } from "vitest";
import { cantidadTexto, costoPromedio, costoUnitario, leerCantidad, porReabastecer, valorCentavos } from "./cantidades";

describe("leerCantidad", () => {
  it("enteros y hasta tres decimales", () => {
    expect(leerCantidad("2")).toBe(2000);
    expect(leerCantidad("2.5")).toBe(2500);
    expect(leerCantidad("0.001")).toBe(1);
    expect(leerCantidad("1,250.75")).toBe(1_250_750);
    expect(leerCantidad(" 3 ")).toBe(3000);
  });
  it("rechaza lo que no es una cantidad", () => {
    for (const m of ["", "abc", "-1", "1.2345", "1.", ".5", "1e3", "3000000"]) expect(leerCantidad(m)).toBeNull();
  });
});

describe("cantidadTexto", () => {
  it("sin ceros sobrantes y con miles", () => {
    expect(cantidadTexto(2500)).toBe("2.5");
    expect(cantidadTexto(2000)).toBe("2");
    expect(cantidadTexto(1)).toBe("0.001");
    expect(cantidadTexto(-1500)).toBe("-1.5");
    expect(cantidadTexto(1_250_750)).toBe("1,250.75");
  });
});

describe("costos", () => {
  it("valor = cantidad × costo, redondeado", () => {
    expect(valorCentavos(2500, 1000)).toBe(2500); // 2.5 u × $10.00 = $25.00
    expect(valorCentavos(333, 100)).toBe(33); // 0.333 u × $1.00 = $0.333 → 33 centavos
    expect(valorCentavos(1, 1)).toBe(0);
    expect(valorCentavos(2_000_000_000, 2_000_000_000)).toBe(4_000_000_000_000_000); // el producto pasa de 2^53 y no se pierde precisión
  });
  it("costo unitario a partir de un total", () => {
    expect(costoUnitario(2500, 2500)).toBe(1000);
    expect(costoUnitario(1000, 3000)).toBe(333); // $10.00 entre 3 u
    expect(costoUnitario(1000, 0)).toBe(0);
  });
  it("promedio ponderado de compras", () => {
    expect(costoPromedio([])).toBe(0);
    expect(costoPromedio([{ cantidadMilli: 10_000, costoUnitarioCentavos: 1000 }])).toBe(1000);
    // 10 u a $10 y 30 u a $14 → ($100 + $420) / 40 = $13
    expect(costoPromedio([{ cantidadMilli: 10_000, costoUnitarioCentavos: 1000 }, { cantidadMilli: 30_000, costoUnitarioCentavos: 1400 }])).toBe(1300);
  });
  it("no se desborda con cantidades y costos grandes", () => {
    expect(costoPromedio([{ cantidadMilli: 2_000_000_000, costoUnitarioCentavos: 100_000_000 }])).toBe(100_000_000);
  });
});

describe("reabastecer", () => {
  it("un mínimo en cero no avisa; debajo del mínimo sí; igual al mínimo no", () => {
    expect(porReabastecer(0, 0)).toBe(false);
    expect(porReabastecer(4000, 5000)).toBe(true);
    expect(porReabastecer(5000, 5000)).toBe(false);
    expect(porReabastecer(0, 1)).toBe(true);
  });
});
