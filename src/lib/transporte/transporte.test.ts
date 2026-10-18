import { describe, expect, it } from "vitest";
import { errorDeTraslado, traslapan } from "./horario";

describe("traslapan", () => {
  it("dos traslados a la misma hora se solapan", () => expect(traslapan(480, 60, 480, 30)).toBe(true));
  it("el que empieza dentro de otro se solapa, en cualquier orden", () => {
    expect(traslapan(480, 60, 520, 60)).toBe(true);
    expect(traslapan(520, 60, 480, 60)).toBe(true);
  });
  it("uno que empieza justo cuando termina el otro no se solapa", () => {
    expect(traslapan(480, 60, 540, 60)).toBe(false);
    expect(traslapan(540, 60, 480, 60)).toBe(false);
  });
  it("separados no se solapan", () => expect(traslapan(480, 60, 600, 60)).toBe(false));
  it("uno contenido en otro sí", () => expect(traslapan(480, 180, 520, 30)).toBe(true));
});

describe("errorDeTraslado", () => {
  const bueno = { horaMin: 480, duracionMin: 60, origen: "Hotel Riu", destino: "Marina Cabo", pax: 4, precioCentavos: 0 };
  it("acepta datos correctos", () => expect(errorDeTraslado(bueno)).toBeNull());
  it("rechaza hora, duración, lugares, pasajeros y precio inválidos", () => {
    expect(errorDeTraslado({ ...bueno, horaMin: 1440 })).toMatch(/hora/);
    expect(errorDeTraslado({ ...bueno, horaMin: -1 })).toMatch(/hora/);
    expect(errorDeTraslado({ ...bueno, duracionMin: 5 })).toMatch(/duración/);
    expect(errorDeTraslado({ ...bueno, duracionMin: 721 })).toMatch(/duración/);
    expect(errorDeTraslado({ ...bueno, origen: " " })).toMatch(/recogida/);
    expect(errorDeTraslado({ ...bueno, destino: "x" })).toMatch(/destino/);
    expect(errorDeTraslado({ ...bueno, pax: 0 })).toMatch(/pasajeros/);
    expect(errorDeTraslado({ ...bueno, precioCentavos: -1 })).toMatch(/precio/);
  });
});
