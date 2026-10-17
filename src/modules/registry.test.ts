import { describe, expect, it } from "vitest";
import { MODULOS_POR_PLAN, modulosActivos, navDe } from "./registry";
import { puede } from "./permisos";

describe("registro de módulos", () => {
  it("siempre incluye núcleo e ignora ids desconocidos", () => {
    expect(modulosActivos(["flota", "inexistente"]).sort()).toEqual(["flota", "nucleo"]);
  });
  it("descarta módulos con dependencias faltantes (en cascada)", () => {
    // calendario requiere flota+reservas; reservas requiere flota
    expect(modulosActivos(["reservas", "calendario"])).toEqual(["nucleo"]);
    expect(modulosActivos(["flota", "calendario"]).sort()).toEqual(["flota", "nucleo"]);
  });
  it("el plan básico no trae calendario", () => {
    expect(navDe(modulosActivos(MODULOS_POR_PLAN.BASICO)).map((n) => n.href)).not.toContain("/calendario");
  });
  it("el plan pro trae toda la navegación", () => {
    const hrefs = navDe(modulosActivos(MODULOS_POR_PLAN.PRO), "ADMIN").map((n) => n.href);
    expect(hrefs).toEqual(["/dashboard", "/configuracion", "/calendario", "/reservas", "/clientes", "/flota"]);
  });
  it("configuración solo se muestra al admin", () => {
    const hrefs = navDe(modulosActivos(MODULOS_POR_PLAN.PRO), "VENDEDOR").map((n) => n.href);
    expect(hrefs).not.toContain("/configuracion");
  });
});

describe("permisos", () => {
  it("solo ADMIN administra usuarios", () => {
    expect(puede("ADMIN", "usuarios:administrar")).toBe(true);
    expect(puede("GERENTE", "usuarios:administrar")).toBe(false);
  });
  it("operaciones no crea reservas; vendedor no edita flota", () => {
    expect(puede("OPERACIONES", "reservas:escribir")).toBe(false);
    expect(puede("VENDEDOR", "flota:escribir")).toBe(false);
  });
});
