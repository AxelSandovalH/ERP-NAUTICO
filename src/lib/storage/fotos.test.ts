import { describe, expect, it } from "vitest";
import { MAX_FOTO_BYTES, nuevaRutaFoto, rutaFotoPerteneceA, validarFoto } from "./reglas";

describe("fotos de embarcaciones", () => {
  it("acepta JPG, PNG y WebP y rechaza PDF, vacíos y archivos grandes", () => {
    expect(validarFoto({ mime: "image/jpeg", tamano: 1000 })).toBeNull();
    expect(validarFoto({ mime: "image/webp", tamano: 1000 })).toBeNull();
    expect(validarFoto({ mime: "application/pdf", tamano: 1000 })).not.toBeNull();
    expect(validarFoto({ mime: "image/png", tamano: 0 })).not.toBeNull();
    expect(validarFoto({ mime: "image/png", tamano: MAX_FOTO_BYTES + 1 })).not.toBeNull();
  });
  it("solo acepta rutas de la misma empresa y embarcación", () => {
    const r = nuevaRutaFoto("t1", "e1", "image/jpeg", "abc-123");
    expect(r).toBe("t1/e1/abc-123.jpg");
    expect(rutaFotoPerteneceA(r, "t1", "e1")).toBe(true);
    expect(rutaFotoPerteneceA(r, "t2", "e1")).toBe(false);
    expect(rutaFotoPerteneceA(r, "t1", "e2")).toBe(false);
    expect(rutaFotoPerteneceA("t1/e1/../x.jpg", "t1", "e1")).toBe(false);
    expect(rutaFotoPerteneceA("t1/e1/a.pdf", "t1", "e1")).toBe(false);
  });
});
