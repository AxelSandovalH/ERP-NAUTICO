import { describe, expect, it } from "vitest";
import { leerCsv } from "./csv";
import { aplicarMapeo, clavesDeLineas, detectarEncabezado, detectarMapeo, leerFecha, leerMonto } from "./importar";
import { sugerir } from "./sugerir";
import { explicarDiferencia, ultimoDiaDelMes } from "./cierre";

describe("leerCsv", () => {
  it("coma, punto y coma, comillas y BOM", () => {
    expect(leerCsv('﻿a,b,c\n1,"x, y",3\n')).toEqual([["a", "b", "c"], ["1", "x, y", "3"]]);
    expect(leerCsv("fecha;monto\r\n01/03/2026;1.234,50\r\n")).toEqual([["fecha", "monto"], ["01/03/2026", "1.234,50"]]);
    expect(leerCsv('a,"di ""hola"""\n')).toEqual([["a", 'di "hola"']]);
  });
  it("ignora renglones vacíos y acepta tabulador", () => {
    expect(leerCsv("a\tb\n\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("leerFecha", () => {
  it("formatos comunes", () => {
    expect(leerFecha("2026-03-05")).toBe("2026-03-05");
    expect(leerFecha("05/03/2026")).toBe("2026-03-05");
    expect(leerFecha("5-mar-2026")).toBe("2026-03-05");
    expect(leerFecha("05/03/26")).toBe("2026-03-05");
    expect(leerFecha("5 de marzo de 2026")).toBe("2026-03-05");
    expect(leerFecha("03/05/2026", "mdy")).toBe("2026-03-05");
    expect(leerFecha("2026-03-05 14:20:00")).toBe("2026-03-05");
  });
  it("rechaza fechas imposibles o basura", () => {
    expect(leerFecha("31/02/2026")).toBeNull();
    expect(leerFecha("hola")).toBeNull();
    expect(leerFecha("")).toBeNull();
  });
});

describe("leerMonto", () => {
  it("separadores, signos y símbolos", () => {
    expect(leerMonto("$1,234.56")).toBe(123456);
    expect(leerMonto("1.234,56")).toBe(123456);
    expect(leerMonto("-500")).toBe(-50000);
    expect(leerMonto("(500.00)")).toBe(-50000);
    expect(leerMonto("500.00-")).toBe(-50000);
    expect(leerMonto("1,234")).toBe(123400);
    expect(leerMonto("1,234,567.89")).toBe(123456789);
    expect(leerMonto("12.5")).toBe(1250);
    expect(leerMonto("0.07")).toBe(7);
    expect(leerMonto("250.00 CR")).toBe(25000);
    expect(leerMonto("250.00 DB")).toBe(-25000);
  });
  it("vacío o texto no es un importe", () => {
    expect(leerMonto("")).toBeNull();
    expect(leerMonto("abc")).toBeNull();
    expect(leerMonto("-")).toBeNull();
  });
});

describe("detección de columnas y aplicación", () => {
  const csv = "Estado de cuenta BBVA\nCuenta 1234\nFecha,Descripción,Cargo,Abono,Saldo\n01/03/2026,GASOLINERA,500.00,,9500.00\n02/03/2026,DEPOSITO RESERVA 15,,3000.00,12500.00\n,,,,\nfoo,x,,,\n";
  it("encuentra el encabezado entre líneas de relleno", () => {
    const filas = leerCsv(csv);
    expect(detectarEncabezado(filas)).toBe(2);
  });
  it("mapea cargos y abonos separados", () => {
    const filas = leerCsv(csv), h = detectarEncabezado(filas);
    const m = detectarMapeo(filas[h]);
    expect(m).toMatchObject({ modo: "separado", fecha: 0, descripcion: 1, cargo: 2, abono: 3, saldo: 4 });
    const r = aplicarMapeo(filas.slice(h + 1), m, h + 2);
    expect(r.lineas).toEqual([
      { fecha: "2026-03-01", descripcion: "GASOLINERA", montoCentavos: -50000, saldoCentavos: 950000, referencia: null },
      { fecha: "2026-03-02", descripcion: "DEPOSITO RESERVA 15", montoCentavos: 300000, saldoCentavos: 1250000, referencia: null },
    ]);
    expect(r.errores).toEqual([{ fila: 6, motivo: "Fecha no válida («foo»)" }]);
  });
  it("columna única con signo, y tarjeta de crédito invertida", () => {
    const filas = leerCsv("Fecha;Concepto;Importe\n01/03/2026;Hotel;-1.200,00\n02/03/2026;Pago;1.200,00");
    const m = detectarMapeo(filas[0]);
    expect(m.modo).toBe("unico");
    expect(aplicarMapeo(filas.slice(1), m).lineas.map((l) => l.montoCentavos)).toEqual([-120000, 120000]);
    expect(aplicarMapeo(filas.slice(1), { ...m, invertir: true }).lineas.map((l) => l.montoCentavos)).toEqual([120000, -120000]);
  });
  it("omite renglones en cero y avisa de los ilegibles", () => {
    const filas = leerCsv("Fecha,Descripcion,Monto\n01/03/2026,Info,0\n02/03/2026,Algo,abc");
    const r = aplicarMapeo(filas.slice(1), detectarMapeo(filas[0]));
    expect(r.lineas).toHaveLength(0);
    expect(r.errores).toEqual([{ fila: 3, motivo: "Importe no válido" }]);
  });
});

describe("claves de línea", () => {
  const l = (d: string, m: number, t: string) => ({ fecha: d, descripcion: t, montoCentavos: m, saldoCentavos: null, referencia: null });
  it("renglones idénticos se distinguen por su ocurrencia y son estables al reimportar", () => {
    const a = clavesDeLineas([l("2026-03-01", -100, "Café"), l("2026-03-01", -100, "CAFÉ"), l("2026-03-02", -100, "Café")]);
    expect(new Set(a).size).toBe(3);
    expect(clavesDeLineas([l("2026-03-01", -100, "Café"), l("2026-03-01", -100, "CAFÉ"), l("2026-03-02", -100, "Café")])).toEqual(a);
  });
});

describe("sugerir", () => {
  const linea = (id: string, fecha: string, monto: number, d = "") => ({ id, fecha, montoCentavos: monto, descripcion: d });
  const cand = (clave: string, fecha: string, monto: number, texto = "") => ({ clave, fecha, montoCentavos: monto, texto });
  it("empareja por importe exacto y fecha dentro de la ventana", () => {
    const s = sugerir([linea("L1", "2026-03-05", -50000)], [cand("g:1", "2026-03-03", -50000), cand("g:2", "2026-03-20", -50000), cand("g:3", "2026-03-05", -50100)]);
    expect(s.get("L1")).toMatchObject({ elegida: "g:1", segura: true });
  });
  it("entre varias gana la fecha más cercana y la descripción parecida", () => {
    const s = sugerir([linea("L1", "2026-03-05", -50000, "PEMEX gasolina")], [cand("g:1", "2026-03-03", -50000, "Comida"), cand("g:2", "2026-03-04", -50000, "Gasolina lancha")]);
    expect(s.get("L1")).toMatchObject({ elegida: "g:2", segura: false });
  });
  it("un movimiento del sistema no se usa dos veces", () => {
    const s = sugerir([linea("L1", "2026-03-05", -100, "a"), linea("L2", "2026-03-06", -100, "b")], [cand("g:1", "2026-03-05", -100)]);
    expect([s.get("L1")!.elegida, s.get("L2")!.elegida].filter(Boolean)).toEqual(["g:1"]);
  });
  it("entradas y salidas no se confunden", () => {
    expect(sugerir([linea("L1", "2026-03-05", 100)], [cand("g:1", "2026-03-05", -100)]).get("L1")!.elegida).toBeNull();
  });
});

describe("cierre", () => {
  it("la diferencia queda explicada por lo no conciliado", () => {
    // Banco 10 500, sistema 10 000: el banco cobró 300 de comisión (solo banco, −300) y falta que cobre un depósito de 800 del sistema
    const r = explicarDiferencia({ saldoBancoCentavos: 1_050_000, saldoSistemaCentavos: 1_000_000, pendientesBancoCentavos: -30_000, sinConciliarSistemaCentavos: -80_000 });
    expect(r).toEqual({ diferencia: 50_000, explicada: 50_000, sinExplicar: 0 });
  });
  it("lo que no cuadra se reporta", () => {
    expect(explicarDiferencia({ saldoBancoCentavos: 100, saldoSistemaCentavos: 0, pendientesBancoCentavos: 0, sinConciliarSistemaCentavos: 0 }).sinExplicar).toBe(100);
  });
  it("último día del mes", () => {
    expect(ultimoDiaDelMes("2026-02")).toBe("2026-02-28");
    expect(ultimoDiaDelMes("2028-02")).toBe("2028-02-29");
    expect(ultimoDiaDelMes("2026-12")).toBe("2026-12-31");
  });
});

import { csvDeReporte } from "./reporte";
describe("reporte CSV", () => {
  it("escapa comas y comillas y separa las dos secciones", () => {
    const csv = csvDeReporte({
      cuenta: 'Banco "Principal", MXN', moneda: "MXN", mes: "2026-03", saldoBancoCentavos: 100050, saldoSistemaCentavos: 100000, diferencia: 50, explicada: 50, sinExplicar: 0,
      soloBanco: [{ fecha: "2026-03-05", descripcion: "COMISION, MANEJO", montoCentavos: -3480, estado: "PENDIENTE" }],
      soloSistema: [{ fecha: "2026-03-06", texto: "Hielo", montoCentavos: -9900 }],
    });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Banco ""Principal"", MXN"');
    expect(csv).toContain('Solo en el banco,2026-03-05,"COMISION, MANEJO",-34.80,PENDIENTE');
    expect(csv).toContain("Solo en el sistema,2026-03-06,Hielo,-99.00,");
  });
});
