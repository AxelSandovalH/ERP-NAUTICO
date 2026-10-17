import { describe, expect, it } from "vitest";
import { fondoClaro } from "./contraste";
import { abreviarOrigen, cobroDe, hhmm, inicioFin, iniciales } from "./mapear";
import { describirVentana, hhmmAMin, minAHora, ventanasLibres } from "./ventanas-disponibilidad";

describe("contraste", () => {
  it("ámbar y amarillo piden texto oscuro; azul y verde oscuro, blanco", () => {
    expect(fondoClaro("#fbbf24")).toBe(true);
    expect(fondoClaro("#0369a1")).toBe(false);
    expect(fondoClaro("#7c3aed")).toBe(false);
    expect(fondoClaro(null)).toBe(false);
  });
});

describe("mapear", () => {
  it("estado de cobro", () => {
    expect(cobroDe(10000, 0)).toBe("SIN_PAGO");
    expect(cobroDe(10000, 4000)).toBe("PARCIAL");
    expect(cobroDe(10000, 10000)).toBe("LIQUIDADA");
    expect(cobroDe(10000, 12000)).toBe("LIQUIDADA");
  });
  it("iniciales y abreviaturas", () => {
    expect(iniciales("Ana Demo")).toBe("AD");
    expect(iniciales("Víctor")).toBe("VÍ");
    expect(iniciales("María de los Ángeles Pérez")).toBe("MP");
    expect(abreviarOrigen("AGENCIA")).toBe("AG");
  });
  it("hora local sin zona", () => {
    expect(hhmm(615)).toBe("10:15");
    expect(inicioFin("2026-10-17", 540)).toBe("2026-10-17T09:00:00");
  });
});

describe("ventanas de disponibilidad", () => {
  const p = { duracionMin: 180, margenMin: 30, diaIni: hhmmAMin("09:00"), diaFin: hhmmAMin("20:00") };
  it("día libre = una ventana de todo el día", () => {
    const v = ventanasLibres([], p);
    expect(v).toHaveLength(1);
    expect(describirVentana(v[0])).toBe("Todo el día — 9:00 a.m. a 8:00 p.m.");
  });
  it("respeta el margen entre tours", () => {
    const v = ventanasLibres([{ ini: hhmmAMin("12:00"), fin: hhmmAMin("15:00"), tipo: "RESERVA", label: "x" }], p);
    // antes: 9:00 → 11:30 (150 min < 180) no cabe; después: 15:30 → 20:00 sí
    expect(v).toHaveLength(1);
    expect(v[0].ini).toBe(hhmmAMin("15:30"));
  });
  it("fusiona reservas traslapadas y descarta huecos cortos", () => {
    const v = ventanasLibres([
      { ini: hhmmAMin("09:00"), fin: hhmmAMin("13:00"), tipo: "RESERVA", label: "a" },
      { ini: hhmmAMin("12:00"), fin: hhmmAMin("16:00"), tipo: "BLOQUEO", label: "b" },
    ], p);
    expect(v).toEqual([{ ini: hhmmAMin("16:30"), fin: hhmmAMin("20:00"), grupos: ["SUNSET"] }]);
  });
  it("día completamente ocupado = sin ventanas", () => {
    expect(ventanasLibres([{ ini: 0, fin: 24 * 60, tipo: "BLOQUEO", label: "x" }], p)).toEqual([]);
  });
  it("formatea horas", () => {
    expect(minAHora(0)).toBe("12:00 a.m.");
    expect(minAHora(12 * 60 + 30)).toBe("12:30 p.m.");
  });
});
