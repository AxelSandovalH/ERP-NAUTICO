import { describe, expect, it } from "vitest";
import { MODULOS, MODULOS_POR_PLAN, PLANES, PLANES_DE_PAGO, caracteristicasDe, esConstruido, modulosActivos, modulosEfectivos, navDe, type ModuloId } from "./registry";
import { puede } from "./permisos";

const hrefs = (plan: Parameters<typeof modulosEfectivos>[0], rol: "ADMIN" | "GERENTE" | "VENDEDOR" | "OPERACIONES" = "ADMIN") =>
  navDe(modulosEfectivos(plan, MODULOS_POR_PLAN[plan]), rol).map((n) => n.href);

describe("registro de módulos", () => {
  it("siempre incluye núcleo e ignora ids desconocidos", () => {
    expect(modulosActivos(["flota", "inexistente"]).sort()).toEqual(["flota", "nucleo"]);
  });
  it("descarta módulos con dependencias faltantes (en cascada)", () => {
    expect(modulosActivos(["reservas", "calendario"])).toEqual(["nucleo"]); // calendario y reservas necesitan flota
    expect(modulosActivos(["flota", "calendario"]).sort()).toEqual(["flota", "nucleo"]); // calendario necesita reservas
  });
  it("tripulación, comisiones, nómina y asistencia dependen de lo que necesitan", () => {
    expect(modulosActivos(["flota", "tripulacion", "comisiones"]).sort()).toEqual(["flota", "nucleo"]);
    expect(modulosActivos(["flota", "asistencia"]).sort()).toEqual(["flota", "nucleo"]); // asistencia necesita nómina
    expect(modulosActivos(["asistencia", "nomina"]).sort()).toEqual(["asistencia", "nomina", "nucleo"]);
  });
  it("cuentas acompaña a gastos o ingresos y no se ofrece aparte; ingresos necesita reservas", () => {
    expect(modulosActivos(["flota", "gastos"]).sort()).toEqual(["cuentas", "flota", "gastos", "nucleo"]);
    expect(modulosActivos(["flota", "reservas", "ingresos"]).sort()).toEqual(["cuentas", "flota", "ingresos", "nucleo", "reservas"]);
    expect(modulosActivos(["flota", "ingresos"]).sort()).toEqual(["flota", "nucleo"]); // sin reservas se descarta, y con él cuentas
    expect(MODULOS.cuentas.implicito).toBe(true);
  });
  it("los módulos 'próximamente' nunca se activan, aunque el plan los incluya", () => {
    for (const id of ["transporte", "facturacion"] as ModuloId[]) {
      expect(esConstruido(id)).toBe(false);
      expect(modulosActivos(["flota", id])).not.toContain(id);
      expect(MODULOS[id].nav).toEqual([]); // sin enlaces muertos
    }
  });
});

describe("conciliación bancaria", () => {
  it("es un módulo construido que necesita cuentas y solo trae el plan Enterprise", () => {
    expect(esConstruido("conciliacion")).toBe(true);
    expect(MODULOS.conciliacion.nav[0].href).toBe("/conciliacion");
    expect(modulosActivos(["conciliacion"])).not.toContain("conciliacion"); // sin cuentas no se activa
    expect(modulosActivos(["gastos", "conciliacion"])).toEqual(expect.arrayContaining(["cuentas", "conciliacion"]));
    expect(MODULOS_POR_PLAN.ENTERPRISE).toContain("conciliacion");
    expect(MODULOS_POR_PLAN.GESTION).not.toContain("conciliacion");
    expect(MODULOS_POR_PLAN.CONTROL).not.toContain("conciliacion");
  });
});

describe("inventario", () => {
  it("es un módulo construido que necesita gastos y viene desde el plan Gestión", () => {
    expect(esConstruido("inventario")).toBe(true);
    expect(modulosActivos(["inventario"])).not.toContain("inventario"); // sin gastos no se activa
    expect(modulosActivos(["gastos", "inventario"])).toEqual(expect.arrayContaining(["inventario", "gastos", "cuentas"]));
    expect(MODULOS_POR_PLAN.CONTROL).not.toContain("inventario");
    expect(MODULOS_POR_PLAN.GESTION).toContain("inventario");
    expect(MODULOS_POR_PLAN.ENTERPRISE).toContain("inventario");
  });
  it("permisos: operaciones registra consumos; solo administradores y gerentes compran y administran", () => {
    expect(puede("OPERACIONES", "inventario:ver")).toBe(true);
    expect(puede("OPERACIONES", "inventario:operar")).toBe(true);
    expect(puede("OPERACIONES", "inventario:administrar")).toBe(false);
    expect(puede("GERENTE", "inventario:administrar")).toBe(true);
    expect(puede("VENDEDOR", "inventario:ver")).toBe(false);
  });
});

describe("horarios", () => {
  it("es un módulo construido e independiente, incluido desde el plan Control", () => {
    expect(esConstruido("horarios")).toBe(true);
    expect(modulosActivos(["horarios"])).toContain("horarios");
    for (const plan of ["CONTROL", "GESTION", "ENTERPRISE"] as const) expect(MODULOS_POR_PLAN[plan]).toContain("horarios");
  });
  it("todos ven su horario; solo administradores, gerentes y operaciones lo planean", () => {
    for (const rol of ["ADMIN", "GERENTE", "VENDEDOR", "OPERACIONES"] as const) expect(puede(rol, "horarios:ver_propio")).toBe(true);
    expect(puede("ADMIN", "horarios:administrar")).toBe(true);
    expect(puede("GERENTE", "horarios:administrar")).toBe(true);
    expect(puede("OPERACIONES", "horarios:administrar")).toBe(true);
    expect(puede("VENDEDOR", "horarios:administrar")).toBe(false);
  });
});

describe("reportes", () => {
  it("es un módulo construido, independiente, y solo trae el plan Enterprise", () => {
    expect(esConstruido("reportes")).toBe(true);
    expect(MODULOS.reportes.nav[0].href).toBe("/reportes");
    expect(modulosActivos(["reservas", "reportes"])).toContain("reportes");
    expect(MODULOS_POR_PLAN.ENTERPRISE).toContain("reportes");
    expect(MODULOS_POR_PLAN.GESTION).not.toContain("reportes");
  });
  it("solo administradores y gerentes los ven", () => {
    expect(puede("ADMIN", "reportes:ver")).toBe(true);
    expect(puede("GERENTE", "reportes:ver")).toBe(true);
    expect(puede("VENDEDOR", "reportes:ver")).toBe(false);
    expect(puede("OPERACIONES", "reportes:ver")).toBe(false);
  });
});

describe("planes y precios", () => {
  it("los precios son los de FleetNautic", () => {
    expect(PLANES.CONTROL.precioMxnMensual).toBe(6000);
    expect(PLANES.GESTION.precioMxnMensual).toBe(10000);
    expect(PLANES.ENTERPRISE.precioMxnMensual).toBe(15000);
    expect(PLANES.PRUEBA.precioMxnMensual).toBeNull();
    expect(PLANES_DE_PAGO).toEqual(["CONTROL", "GESTION", "ENTERPRISE"]);
  });
  it("cada plan incluye todo lo del anterior", () => {
    const m = (p: "CONTROL" | "GESTION" | "ENTERPRISE") => new Set(MODULOS_POR_PLAN[p]);
    for (const x of m("CONTROL")) expect(m("GESTION").has(x)).toBe(true);
    for (const x of m("GESTION")) expect(m("ENTERPRISE").has(x)).toBe(true);
    expect(m("GESTION").size).toBeGreaterThan(m("CONTROL").size);
    expect(m("ENTERPRISE").size).toBeGreaterThan(m("GESTION").size);
  });
  it("las características de cada plan son las del pricing, en orden", () => {
    const e = (p: Parameters<typeof caracteristicasDe>[0]) => caracteristicasDe(p).map((c) => c.etiqueta);
    expect(e("CONTROL")).toEqual(["Calendario operativo", "Horarios", "Ingresos", "Gastos", "Flota"]);
    expect(e("GESTION")).toEqual([...e("CONTROL"), "Inventario", "Equipo", "Transporte", "Facturación"]);
    expect(e("ENTERPRISE")).toEqual([...e("GESTION"), "Conciliación bancaria", "Asistencia + nómina", "Comisiones", "Gráficas, dashboard y reportes"]);
  });
  it("la prueba incluye todas las características de pago", () => {
    expect(caracteristicasDe("PRUEBA").map((c) => c.etiqueta)).toEqual(e("ENTERPRISE"));
    function e(p: Parameters<typeof caracteristicasDe>[0]) { return caracteristicasDe(p).map((c) => c.etiqueta); }
  });
  it("todos los módulos de los planes existen en el registro", () => {
    for (const p of Object.keys(PLANES) as (keyof typeof PLANES)[]) for (const id of MODULOS_POR_PLAN[p]) expect(MODULOS[id]).toBeDefined();
  });
});

describe("qué ve cada plan", () => {
  it("Control: calendario, reservas y clientes, ingresos, gastos, cuentas y flota; nada de equipo ni nómina", () => {
    const h = hrefs("CONTROL");
    expect(h).toEqual(expect.arrayContaining(["/calendario", "/reservas", "/clientes", "/ingresos", "/gastos", "/cuentas", "/flota"]));
    for (const x of ["/tripulacion", "/comisiones", "/asistencia", "/nomina"]) expect(h).not.toContain(x);
  });
  it("Gestión suma Equipo; sigue sin comisiones ni nómina", () => {
    const h = hrefs("GESTION");
    expect(h).toContain("/tripulacion");
    for (const x of ["/comisiones", "/asistencia", "/nomina"]) expect(h).not.toContain(x);
    expect(navDe(modulosEfectivos("GESTION", MODULOS_POR_PLAN.GESTION), "ADMIN").find((n) => n.href === "/tripulacion")?.etiqueta).toBe("Equipo");
  });
  it("Enterprise y Prueba ven todo lo construido", () => {
    for (const p of ["ENTERPRISE", "PRUEBA"] as const) expect(hrefs(p)).toEqual(expect.arrayContaining(["/calendario", "/ingresos", "/gastos", "/tripulacion", "/comisiones", "/asistencia", "/nomina", "/flota"]));
  });
  it("el plan es el tope: bajar de plan quita módulos aunque sigan guardados", () => {
    const todos = MODULOS_POR_PLAN.ENTERPRISE as string[];
    expect(modulosEfectivos("ENTERPRISE", todos)).toContain("nomina");
    expect(modulosEfectivos("CONTROL", todos)).not.toContain("nomina");
    expect(modulosEfectivos("CONTROL", todos)).not.toContain("tripulacion");
    expect(modulosEfectivos("CONTROL", todos)).toContain("gastos");
    expect(modulosEfectivos("GESTION", todos)).toContain("tripulacion");
  });
  it("la empresa puede apagar módulos dentro de su plan, pero nunca encender los de otro", () => {
    expect(modulosEfectivos("CONTROL", ["flota", "reservas", "calendario"]).sort()).toEqual(["calendario", "flota", "nucleo", "reservas"]);
    expect(modulosEfectivos("CONTROL", ["flota", "reservas", "comisiones"])).not.toContain("comisiones");
  });
});

describe("navegación por rol", () => {
  it("configuración solo se muestra al admin", () => {
    expect(hrefs("ENTERPRISE", "ADMIN")).toContain("/configuracion");
    expect(hrefs("ENTERPRISE", "VENDEDOR")).not.toContain("/configuracion");
  });
  it("todos checan asistencia; solo admin y gerente ven nómina", () => {
    for (const r of ["ADMIN", "GERENTE", "VENDEDOR", "OPERACIONES"] as const) expect(hrefs("ENTERPRISE", r)).toContain("/asistencia");
    expect(hrefs("ENTERPRISE", "VENDEDOR")).not.toContain("/nomina");
    expect(hrefs("ENTERPRISE", "OPERACIONES")).not.toContain("/nomina");
    expect(hrefs("ENTERPRISE", "GERENTE")).toContain("/nomina");
  });
  it("finanzas: gerente y admin ven todo; operaciones solo registra gastos; vendedor nada", () => {
    expect(hrefs("ENTERPRISE", "GERENTE")).toEqual(expect.arrayContaining(["/gastos", "/ingresos", "/cuentas"]));
    expect(hrefs("ENTERPRISE", "OPERACIONES")).toContain("/gastos");
    for (const x of ["/ingresos", "/cuentas"]) expect(hrefs("ENTERPRISE", "OPERACIONES")).not.toContain(x);
    for (const x of ["/gastos", "/ingresos", "/cuentas"]) expect(hrefs("ENTERPRISE", "VENDEDOR")).not.toContain(x);
  });
});

describe("permisos", () => {
  it("solo ADMIN administra usuarios", () => {
    expect(puede("ADMIN", "usuarios:administrar")).toBe(true);
    expect(puede("GERENTE", "usuarios:administrar")).toBe(false);
  });
  it("comisiones: el vendedor ve las suyas pero no administra; operaciones asigna equipo", () => {
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
