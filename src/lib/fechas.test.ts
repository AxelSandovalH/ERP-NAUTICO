import { afterEach, describe, expect, it, vi } from "vitest";
import { diasDelMes, esIso, hoyIso, offsetInicioMes, pesosACentavos, sumarDias, sumarMeses } from "./fechas";

afterEach(() => vi.useRealTimers());

describe("fechas", () => {
  it("hoy se calcula en la zona del negocio, no en UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T02:00:00Z")); // 19:00 del 17 en Los Cabos
    expect(hoyIso("America/Mazatlan")).toBe("2026-10-17");
    expect(hoyIso("UTC")).toBe("2026-10-18");
  });
  it("suma días y meses cruzando límites", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2028-03-01", -1)).toBe("2028-02-29");
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
  });
  it("calendario del mes", () => {
    expect(diasDelMes("2028-02")).toBe(29);
    expect(offsetInicioMes("2026-10")).toBe(3); // 1 oct 2026 es jueves
  });
  it("esIso rechaza fechas imposibles que JavaScript desbordaría", () => {
    for (const ok of ["2026-02-28", "2028-02-29", "2026-12-31", "2026-04-30"]) expect(esIso(ok)).toBe(true);
    for (const mal of ["2026-02-31", "2027-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-32", "2026-1-5", "", null, undefined]) expect(esIso(mal)).toBe(false);
  });
  it("convierte pesos a centavos sin errores de punto flotante", () => {
    expect(pesosACentavos("1,234.56")).toBe(123456);
    expect(pesosACentavos("0.1")).toBe(10);
    expect(pesosACentavos("abc")).toBeNull();
    expect(pesosACentavos("-5")).toBeNull();
  });
});
