import { describe, expect, it } from "vitest";
import { enBloqueo, hayConflicto, horaAMinutos, minutosAHora, rangoValido, seTraslapan } from "./disponibilidad";

describe("disponibilidad", () => {
  it("rangos contiguos no se traslapan", () => {
    expect(seTraslapan({ inicioMin: 600, finMin: 840 }, { inicioMin: 840, finMin: 960 })).toBe(false);
  });
  it("detecta traslape parcial y contención", () => {
    expect(seTraslapan({ inicioMin: 600, finMin: 840 }, { inicioMin: 780, finMin: 900 })).toBe(true);
    expect(seTraslapan({ inicioMin: 600, finMin: 840 }, { inicioMin: 630, finMin: 700 })).toBe(true);
  });
  it("hayConflicto con lista vacía es falso", () => {
    expect(hayConflicto({ inicioMin: 0, finMin: 60 }, [])).toBe(false);
  });
  it("valida rangos", () => {
    expect(rangoValido({ inicioMin: 600, finMin: 600 })).toBe(false);
    expect(rangoValido({ inicioMin: 700, finMin: 600 })).toBe(false);
    expect(rangoValido({ inicioMin: 600, finMin: 1500 })).toBe(false);
    expect(rangoValido({ inicioMin: 600, finMin: 840 })).toBe(true);
  });
  it("bloqueo es inclusivo en ambos extremos", () => {
    const b = { desde: "2026-03-05", hasta: "2026-03-07" };
    expect(enBloqueo("2026-03-04", b)).toBe(false);
    expect(enBloqueo("2026-03-05", b)).toBe(true);
    expect(enBloqueo("2026-03-07", b)).toBe(true);
    expect(enBloqueo("2026-03-08", b)).toBe(false);
  });
  it("convierte horas", () => {
    expect(minutosAHora(615)).toBe("10:15");
    expect(horaAMinutos("10:15")).toBe(615);
    expect(horaAMinutos("99:00")).toBeNull();
    expect(horaAMinutos("abc")).toBeNull();
  });
});
