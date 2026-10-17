import { describe, expect, it } from "vitest";
import { MODULOS, MODULOS_POR_PLAN, modulosActivos, navDe } from "./registry";
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
  it("el plan básico no trae tripulación ni comisiones", () => {
    const hrefs = navDe(modulosActivos(MODULOS_POR_PLAN.BASICO), "ADMIN").map((n) => n.href);
    expect(hrefs).not.toContain("/tripulacion");
    expect(hrefs).not.toContain("/comisiones");
  });
  it("tripulación y comisiones se apagan si falta reservas", () => {
    expect(modulosActivos(["flota", "tripulacion", "comisiones"]).sort()).toEqual(["flota", "nucleo"]);
  });
  it("el plan básico no trae nómina ni asistencia; asistencia se apaga sin nómina", () => {
    const hrefs = navDe(modulosActivos(MODULOS_POR_PLAN.BASICO), "ADMIN").map((n) => n.href);
    expect(hrefs).not.toContain("/nomina");
    expect(hrefs).not.toContain("/asistencia");
    expect(modulosActivos(["flota", "asistencia"]).sort()).toEqual(["flota", "nucleo"]);
    expect(modulosActivos(["asistencia", "nomina"]).sort()).toEqual(["asistencia", "nomina", "nucleo"]);
  });
  it("todos checan asistencia; solo admin y gerente ven la nómina", () => {
    const hrefs = (rol: "ADMIN" | "GERENTE" | "VENDEDOR" | "OPERACIONES") => navDe(modulosActivos(MODULOS_POR_PLAN.PRO), rol).map((n) => n.href);
    for (const r of ["ADMIN", "GERENTE", "VENDEDOR", "OPERACIONES"] as const) expect(hrefs(r)).toContain("/asistencia");
    expect(hrefs("VENDEDOR")).not.toContain("/nomina");
    expect(hrefs("OPERACIONES")).not.toContain("/nomina");
    expect(hrefs("GERENTE")).toContain("/nomina");
  });
  it("cuentas acompaña a gastos o ingresos y no se ofrece aparte; ingresos necesita reservas", () => {
    expect(modulosActivos(["flota", "gastos"]).sort()).toEqual(["cuentas", "flota", "gastos", "nucleo"]);
    expect(modulosActivos(["flota", "reservas", "ingresos"]).sort()).toEqual(["cuentas", "flota", "ingresos", "nucleo", "reservas"]);
    // ingresos sin reservas se descarta, y con él cuentas (nadie la usa)
    expect(modulosActivos(["flota", "ingresos"]).sort()).toEqual(["flota", "nucleo"]);
    expect(MODULOS.cuentas.implicito).toBe(true);
  });
  it("finanzas: gerente y admin ven todo; operaciones solo registra gastos; vendedor nada", () => {
    const hrefs = (rol: "ADMIN" | "GERENTE" | "VENDEDOR" | "OPERACIONES") => navDe(modulosActivos(MODULOS_POR_PLAN.PRO), rol).map((n) => n.href);
    expect(hrefs("GERENTE")).toEqual(expect.arrayContaining(["/gastos", "/ingresos", "/cuentas"]));
    expect(hrefs("OPERACIONES")).toContain("/gastos");
    expect(hrefs("OPERACIONES")).not.toContain("/ingresos");
    expect(hrefs("OPERACIONES")).not.toContain("/cuentas");
    for (const r of ["/gastos", "/ingresos", "/cuentas"]) expect(hrefs("VENDEDOR")).not.toContain(r);
  });
  it("el plan básico no trae calendario", () => {
    expect(navDe(modulosActivos(MODULOS_POR_PLAN.BASICO)).map((n) => n.href)).not.toContain("/calendario");
  });
  it("el plan pro trae toda la navegación", () => {
    const hrefs = navDe(modulosActivos(MODULOS_POR_PLAN.PRO), "ADMIN").map((n) => n.href);
    expect(hrefs).toEqual(["/dashboard", "/configuracion", "/calendario", "/reservas", "/clientes", "/ingresos", "/gastos", "/cuentas", "/tripulacion", "/comisiones", "/asistencia", "/nomina", "/flota"]);
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
  it("comisiones: el vendedor ve las suyas pero no administra; operaciones asigna tripulación", () => {
    expect(puede("VENDEDOR", "comisiones:ver_propias")).toBe(true);
    expect(puede("VENDEDOR", "comisiones:administrar")).toBe(false);
    expect(puede("OPERACIONES", "comisiones:ver_propias")).toBe(false);
    expect(puede("OPERACIONES", "tripulacion:asignar")).toBe(true);
    expect(puede("VENDEDOR", "tripulacion:escribir")).toBe(false);
  });
  it("nómina: solo admin/gerente; operaciones administra asistencia pero no sueldos", () => {
    expect(puede("GERENTE", "nomina:administrar")).toBe(true);
    expect(puede("OPERACIONES", "nomina:administrar")).toBe(false);
    expect(puede("OPERACIONES", "asistencia:administrar")).toBe(true);
    expect(puede("VENDEDOR", "asistencia:administrar")).toBe(false);
    expect(puede("VENDEDOR", "asistencia:checar")).toBe(true);
  });
  it("operaciones no crea reservas; vendedor no edita flota", () => {
    expect(puede("OPERACIONES", "reservas:escribir")).toBe(false);
    expect(puede("VENDEDOR", "flota:escribir")).toBe(false);
  });
});
