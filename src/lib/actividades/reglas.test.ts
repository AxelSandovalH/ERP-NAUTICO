import { describe, expect, it } from "vitest";
import { cobro, errorDeActividad, errorDePago, errorDeReserva, errorDeSalida, finDeSalida, lugaresLibres, lugaresOcupados, saldo, totalDeReserva } from "./reglas";

const ACT = { nombre: "Snorkel", duracionMin: 240, precioCentavos: 120_000, cupo: 20 };
const SAL = { fecha: "2031-06-10", inicioMin: 540, finMin: 780, cupo: 20, precioCentavos: 120_000 };

describe("actividades: reglas puras", () => {
  it("valida la actividad", () => {
    expect(errorDeActividad(ACT)).toBeNull();
    expect(errorDeActividad({ ...ACT, nombre: " " })).toMatch(/nombre/);
    expect(errorDeActividad({ ...ACT, duracionMin: 10 })).toMatch(/duración/);
    expect(errorDeActividad({ ...ACT, precioCentavos: -1 })).toMatch(/precio/);
    expect(errorDeActividad({ ...ACT, cupo: 0 })).toMatch(/cupo/);
    expect(errorDeActividad({ ...ACT, cupo: 501 })).toMatch(/cupo/);
  });
  it("calcula el fin de la salida y valida el horario", () => {
    expect(finDeSalida(540, 240)).toBe(780);
    expect(errorDeSalida(SAL)).toBeNull();
    expect(errorDeSalida({ ...SAL, fecha: "2031-02-31" })).toMatch(/Fecha/);
    expect(errorDeSalida({ ...SAL, inicioMin: 1200, finMin: 1500 })).toMatch(/mismo día/);
    expect(errorDeSalida({ ...SAL, cupo: 0 })).toMatch(/cupo/);
  });
  it("las reservas canceladas liberan su lugar", () => {
    const rs = [{ pax: 4, estado: "CONFIRMADA" }, { pax: 3, estado: "PENDIENTE" }, { pax: 6, estado: "CANCELADA" }];
    expect(lugaresOcupados(rs)).toBe(7);
    expect(lugaresLibres(10, rs)).toBe(3);
    expect(lugaresLibres(5, rs)).toBe(0); // nunca negativo
  });
  it("no deja reservar de más ni en salidas que no están programadas", () => {
    expect(errorDeReserva(3, 3, "PROGRAMADA")).toBeNull();
    expect(errorDeReserva(4, 3, "PROGRAMADA")).toBe("Solo quedan 3 lugares.");
    expect(errorDeReserva(1, 1, "PROGRAMADA")).toBeNull();
    expect(errorDeReserva(2, 1, "PROGRAMADA")).toBe("Solo quedan 1 lugar.");
    expect(errorDeReserva(1, 0, "PROGRAMADA")).toBe("La salida está llena.");
    expect(errorDeReserva(0, 5, "PROGRAMADA")).toMatch(/al menos 1/);
    expect(errorDeReserva(1, 5, "CANCELADA")).toMatch(/cancelada/);
    expect(errorDeReserva(1, 5, "COMPLETADA")).toMatch(/ya se realizó/);
  });
  it("totales, saldo y estado de cobro", () => {
    expect(totalDeReserva(3, 120_000)).toBe(360_000);
    expect(cobro(360_000, 0)).toBe("SIN_PAGO");
    expect(cobro(360_000, 100_000)).toBe("PARCIAL");
    expect(cobro(360_000, 360_000)).toBe("LIQUIDADA");
    expect(cobro(0, 0)).toBe("LIQUIDADA");
    expect(saldo(360_000, 100_000)).toBe(260_000);
    expect(saldo(100, 500)).toBe(0);
  });
  it("un pago no puede pasar del saldo", () => {
    expect(errorDePago(100_000, 360_000, 0)).toBeNull();
    expect(errorDePago(360_001, 360_000, 0)).toMatch(/mayor al saldo/);
    expect(errorDePago(100_001, 360_000, 260_000)).toMatch(/mayor al saldo/);
    expect(errorDePago(0, 360_000, 0)).toMatch(/mayor a cero/);
  });
});
