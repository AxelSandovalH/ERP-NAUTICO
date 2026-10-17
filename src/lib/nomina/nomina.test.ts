import { describe, expect, it } from "vitest";
import { periodoAnterior, periodoDe, periodoSiguiente, diasEntre } from "./periodos";
import { calcularBruto, clasificarDias, contar, netoDe, type EstadoDia } from "./calculo";
import { distanciaM, evaluarChecada, siguienteTipo, type Ubicacion } from "@/lib/asistencia/geocerca";

describe("periodos", () => {
  it("quincenas: 1–15 y 16–fin (incluye febrero)", () => {
    expect(periodoDe("QUINCENAL", "2026-10-09")).toMatchObject({ inicio: "2026-10-01", fin: "2026-10-15", dias: 15 });
    expect(periodoDe("QUINCENAL", "2026-10-16")).toMatchObject({ inicio: "2026-10-16", fin: "2026-10-31", dias: 16 });
    expect(periodoDe("QUINCENAL", "2026-02-20")).toMatchObject({ inicio: "2026-02-16", fin: "2026-02-28", dias: 13 });
  });
  it("mes y semana (lunes a domingo)", () => {
    expect(periodoDe("MENSUAL", "2028-02-10")).toMatchObject({ inicio: "2028-02-01", fin: "2028-02-29", dias: 29 });
    expect(periodoDe("SEMANAL", "2026-10-17")).toMatchObject({ inicio: "2026-10-12", fin: "2026-10-18", dias: 7 }); // sábado
    expect(periodoDe("SEMANAL", "2026-10-12").inicio).toBe("2026-10-12"); // lunes
    expect(periodoDe("SEMANAL", "2026-10-18").inicio).toBe("2026-10-12"); // domingo
  });
  it("siguiente y anterior cruzan meses y años", () => {
    const q2 = periodoDe("QUINCENAL", "2026-12-20");
    expect(periodoSiguiente("QUINCENAL", q2)).toMatchObject({ inicio: "2027-01-01", fin: "2027-01-15" });
    expect(periodoAnterior("QUINCENAL", periodoDe("QUINCENAL", "2027-01-05"))).toMatchObject({ inicio: "2026-12-16", fin: "2026-12-31" });
    expect(periodoAnterior("MENSUAL", periodoDe("MENSUAL", "2026-03-10")).inicio).toBe("2026-02-01");
  });
  it("etiquetas legibles", () => {
    expect(periodoDe("QUINCENAL", "2026-10-09").etiqueta).toBe("1–15 de octubre 2026");
    expect(periodoDe("MENSUAL", "2026-10-09").etiqueta).toBe("Octubre 2026");
  });
  it("diasEntre es inclusivo", () => expect(diasEntre("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]));
});

describe("clasificación y conteo de días", () => {
  const dias = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];
  it("la corrección manual manda sobre la checada; sin nada queda sin registro", () => {
    const cl = clasificarDias(dias, new Set(["2026-10-01", "2026-10-02"]), new Map<string, EstadoDia>([["2026-10-02", "FALTA"], ["2026-10-03", "TRABAJO"], ["2026-10-04", "VACACIONES"]]));
    expect(cl.map((d) => d.estado)).toEqual(["TRABAJO", "FALTA", "TRABAJO", "VACACIONES", "SIN_REGISTRO"]);
    expect(cl.map((d) => d.origen)).toEqual(["checada", "manual", "manual", "manual", "ninguno"]);
    expect(contar(cl)).toEqual({ trabajados: 3, falta: 1, sinRegistro: 1, descanso: 0, incapacidad: 0 });
  });
  it("con `hoy`, solo los días ya cerrados cuentan como sin registro (ni hoy ni los por venir)", () => {
    const cl = clasificarDias(dias, new Set(["2026-10-01"]), new Map());
    expect(contar(cl).sinRegistro).toBe(4);
    expect(contar(cl, "2026-10-06").sinRegistro).toBe(4); // todo el periodo ya pasó
    expect(contar(cl, "2026-10-03").sinRegistro).toBe(1); // solo el 2; hoy (3) y lo que sigue no
    expect(contar(cl, "2026-10-01").sinRegistro).toBe(0);
  });
  it("permiso sin goce cuenta como falta; descanso e incapacidad no", () => {
    const cl = clasificarDias(dias, new Set(), new Map<string, EstadoDia>([["2026-10-01", "PERMISO"], ["2026-10-02", "DESCANSO"], ["2026-10-03", "INCAPACIDAD"]]));
    expect(contar(cl)).toMatchObject({ falta: 1, descanso: 1, incapacidad: 1, trabajados: 0, sinRegistro: 2 });
  });
});

describe("cálculo del bruto", () => {
  const conteos = (o: Partial<ReturnType<typeof contar>>) => ({ trabajados: 0, falta: 0, sinRegistro: 0, descanso: 0, incapacidad: 0, ...o });
  it("POR_DIA paga cada día trabajado", () => {
    expect(calcularBruto({ esquema: "POR_DIA", sueldoCentavos: 80_000, diasPeriodo: 15, conteos: conteos({ trabajados: 11 }) }).brutoCentavos).toBe(880_000);
    expect(calcularBruto({ esquema: "POR_DIA", sueldoCentavos: 80_000, diasPeriodo: 15, conteos: conteos({}) }).brutoCentavos).toBe(0);
  });
  it("FIJO_PERIODO paga completo y descuenta 1/díasPeriodo por falta", () => {
    const r = calcularBruto({ esquema: "FIJO_PERIODO", sueldoCentavos: 1_500_000, diasPeriodo: 15, conteos: conteos({ falta: 2 }) });
    expect(r.brutoCentavos).toBe(1_500_000);
    expect(r.descuentoFaltasCentavos).toBe(200_000); // 2/15 de 15,000
    expect(r.descripcionDescuento).toMatch(/2 días/);
  });
  it("FIJO sin faltas no descuenta, y los días sin registro no penalizan", () => {
    const r = calcularBruto({ esquema: "FIJO_PERIODO", sueldoCentavos: 1_500_000, diasPeriodo: 15, conteos: conteos({ sinRegistro: 5 }) });
    expect(r.descuentoFaltasCentavos).toBe(0);
    expect(r.descripcionDescuento).toBeUndefined();
  });
  it("el descuento nunca supera el sueldo, y el redondeo es al centavo", () => {
    expect(calcularBruto({ esquema: "FIJO_PERIODO", sueldoCentavos: 1000, diasPeriodo: 15, conteos: conteos({ falta: 99 }) }).descuentoFaltasCentavos).toBe(1000);
    expect(calcularBruto({ esquema: "FIJO_PERIODO", sueldoCentavos: 1000, diasPeriodo: 3, conteos: conteos({ falta: 1 }) }).descuentoFaltasCentavos).toBe(333);
  });
  it("neto = bruto + bonos − deducciones, sin bajar de cero", () => {
    expect(netoDe(1_000_000, 100_000, 250_000)).toBe(850_000);
    expect(netoDe(100_000, 0, 500_000)).toBe(0);
  });
});

describe("geocerca", () => {
  const marina: Ubicacion = { id: "m", nombre: "Marina", lat: 22.8905, lng: -109.9167, radioMetros: 150 };
  const oficina: Ubicacion = { id: "o", nombre: "Oficina", lat: 22.9000, lng: -109.9000, radioMetros: 100 };
  it("distancia haversine razonable", () => {
    expect(distanciaM(22.8905, -109.9167, 22.8905, -109.9167)).toBe(0);
    // 0.001° de latitud ≈ 111 m
    expect(distanciaM(22.8905, -109.9167, 22.8915, -109.9167)).toBeGreaterThan(105);
    expect(distanciaM(22.8905, -109.9167, 22.8915, -109.9167)).toBeLessThan(118);
  });
  it("acepta dentro del radio y elige la ubicación más cercana", () => {
    const r = evaluarChecada(22.8906, -109.9167, 20, [oficina, marina]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ubicacion.id).toBe("m");
  });
  it("rechaza fuera del radio indicando la cercana y la distancia", () => {
    const r = evaluarChecada(22.8950, -109.9167, 20, [marina]);
    expect(r).toMatchObject({ ok: false, motivo: "fuera" });
    if (!r.ok) expect(r.distanciaM).toBeGreaterThan(400);
  });
  it("rechaza sin ubicaciones configuradas o con GPS impreciso", () => {
    expect(evaluarChecada(22.89, -109.91, 10, [])).toMatchObject({ ok: false, motivo: "sin_ubicaciones" });
    expect(evaluarChecada(22.8905, -109.9167, 500, [marina])).toMatchObject({ ok: false, motivo: "gps_debil" });
    expect(evaluarChecada(22.8905, -109.9167, null, [marina]).ok).toBe(true); // sin dato de precisión
  });
  it("entrada y salida se alternan", () => {
    expect(siguienteTipo(null)).toBe("ENTRADA");
    expect(siguienteTipo("ENTRADA")).toBe("SALIDA");
    expect(siguienteTipo("SALIDA")).toBe("ENTRADA");
  });
});
