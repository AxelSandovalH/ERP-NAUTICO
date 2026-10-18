import { describe, expect, it } from "vitest";
import { cruzaMedianoche, diasDeSemana, duracionMin, errorDePlantilla, esLunes, horaAMinutos, horasTexto, lunesDe, minutosTrabajados, rangoTexto } from "./semana";

describe("semanas", () => {
  it("el lunes de cualquier día de la semana", () => {
    // 2026-10-19 es lunes
    for (const d of ["2026-10-19", "2026-10-21", "2026-10-25"]) expect(lunesDe(d)).toBe("2026-10-19");
    expect(lunesDe("2026-10-26")).toBe("2026-10-26");
    expect(lunesDe("2026-01-01")).toBe("2025-12-29"); // cruza de año
  });
  it("esLunes", () => {
    expect(esLunes("2026-10-19")).toBe(true);
    expect(esLunes("2026-10-20")).toBe(false);
    expect(esLunes("hola")).toBe(false);
  });
  it("siete días desde el lunes", () => {
    expect(diasDeSemana("2026-10-26")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});

describe("turnos", () => {
  it("duración y cruce de medianoche", () => {
    expect(duracionMin(8 * 60, 16 * 60)).toBe(480);
    expect(duracionMin(22 * 60, 6 * 60)).toBe(480);
    expect(cruzaMedianoche(22 * 60, 6 * 60)).toBe(true);
    expect(cruzaMedianoche(8 * 60, 16 * 60)).toBe(false);
    expect(duracionMin(0, 1)).toBe(1);
  });
  it("texto del horario", () => {
    expect(rangoTexto(480, 960)).toBe("08:00–16:00");
    expect(rangoTexto(1320, 360)).toBe("22:00–06:00 (+1)");
    expect(horasTexto(480)).toBe("8 h");
    expect(horasTexto(450)).toBe("7.5 h");
  });
  it("validación de plantillas", () => {
    expect(errorDePlantilla("Mañana", 480, 960)).toBeNull();
    expect(errorDePlantilla("Noche", 1320, 360)).toBeNull();
    expect(errorDePlantilla("M", 480, 960)).toMatch(/nombre/);
    expect(errorDePlantilla("Raro", 480, 480)).toMatch(/misma/);
    expect(errorDePlantilla("Raro", -1, 480)).toMatch(/inválido/);
    expect(errorDePlantilla("Raro", 480, 1440)).toMatch(/inválido/);
  });
  it("hora a minutos", () => {
    expect(horaAMinutos("08:30")).toBe(510);
    expect(horaAMinutos("8:05")).toBe(485);
    expect(horaAMinutos("24:00")).toBeNull();
    expect(horaAMinutos("12:60")).toBeNull();
    expect(horaAMinutos("abc")).toBeNull();
  });
  it("solo los turnos suman horas", () => {
    expect(minutosTrabajados([
      { tipo: "TURNO", inicioMin: 480, finMin: 960 }, { tipo: "TURNO", inicioMin: 1320, finMin: 360 },
      { tipo: "DESCANSO", inicioMin: null, finMin: null }, { tipo: "VACACIONES", inicioMin: null, finMin: null },
    ])).toBe(960);
  });
});
