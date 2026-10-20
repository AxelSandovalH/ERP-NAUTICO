import { describe, expect, it } from "vitest";
import { PALETA, colorDeCategoria, esColorHex } from "./colores";

describe("colores de categoría", () => {
  it("usa el color elegido si es válido", () => {
    expect(colorDeCategoria("Combustible", "#112233")).toBe("#112233");
  });
  it("ignora colores inválidos y cae al de la categoría base", () => {
    expect(esColorHex("rojo")).toBe(false);
    expect(colorDeCategoria("Combustible", "rojo")).toBe(colorDeCategoria("Combustible"));
  });
  it("una categoría nueva recibe siempre el mismo color de la paleta", () => {
    const c = colorDeCategoria("Uniformes");
    expect(PALETA).toContain(c);
    expect(colorDeCategoria("Uniformes")).toBe(c);
  });
  it("sin categoría es gris", () => {
    expect(colorDeCategoria(null)).toBe("#94a3b8");
  });
});
