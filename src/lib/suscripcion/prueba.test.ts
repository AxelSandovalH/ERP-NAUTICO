import { describe, expect, it } from "vitest";
import { DIAS_PRUEBA, diasRestantes, finDePrueba, pruebaVencida } from "./prueba";

const t0 = new Date("2026-10-19T12:00:00Z");

describe("prueba de 7 días", () => {
  it("dura siete días", () => {
    expect(DIAS_PRUEBA).toBe(7);
    expect(finDePrueba(t0).toISOString()).toBe("2026-10-26T12:00:00.000Z");
  });
  it("solo vence el plan Prueba, y solo después de su fecha", () => {
    const fin = finDePrueba(t0);
    expect(pruebaVencida("PRUEBA", fin, new Date("2026-10-26T11:59:59Z"))).toBe(false);
    expect(pruebaVencida("PRUEBA", fin, new Date("2026-10-26T12:00:00Z"))).toBe(false); // justo en el instante: aún cuenta
    expect(pruebaVencida("PRUEBA", fin, new Date("2026-10-26T12:00:01Z"))).toBe(true);
    expect(pruebaVencida("ENTERPRISE", fin, new Date("2030-01-01T00:00:00Z"))).toBe(false); // un plan de pago no vence por la prueba
    expect(pruebaVencida("PRUEBA", null, new Date("2030-01-01T00:00:00Z"))).toBe(false); // sin fecha: sin vencimiento
  });
  it("días restantes, redondeando hacia arriba", () => {
    const fin = finDePrueba(t0);
    expect(diasRestantes(fin, t0)).toBe(7);
    expect(diasRestantes(fin, new Date("2026-10-25T10:00:00Z"))).toBe(2); // quedan 26 horas → 2 días
    expect(diasRestantes(fin, new Date("2026-10-26T10:00:00Z"))).toBe(1); // quedan 2 horas → 1 día
    expect(diasRestantes(fin, new Date("2026-10-27T00:00:00Z"))).toBe(0);
    expect(diasRestantes(null, t0)).toBe(0);
  });
});
