import { describe, expect, it } from "vitest";
import { esFacturaUtil, motivoIncompatible, sugerirFacturas, type CfdiRecibido, type GastoPendiente } from "./recibidas";
import { leerRecibida } from "@/lib/procura/cliente";

const cfdi = (id: string, o: Partial<CfdiRecibido> = {}): CfdiRecibido => ({ id, uuid: `U-${id}`, rfcEmisor: "AAA010101AAA", nombreEmisor: "Pemex Marina SA", totalCentavos: 620_000, moneda: "MXN", emitidoEn: "2026-10-18", tipo: "I", estadoSat: "VIGENTE", ...o });
const gasto = (id: string, o: Partial<GastoPendiente> = {}): GastoPendiente => ({ id, fecha: "2026-10-16", montoCentavos: 620_000, moneda: "MXN", texto: "Gasolina Sunseeker Pemex Marina", ...o });

describe("facturas útiles", () => {
  it("solo ingreso vigente", () => {
    expect(esFacturaUtil(cfdi("1"))).toBe(true);
    expect(esFacturaUtil(cfdi("1", { tipo: "P" }))).toBe(false);
    expect(esFacturaUtil(cfdi("1", { tipo: "N" }))).toBe(false);
    expect(esFacturaUtil(cfdi("1", { estadoSat: "CANCELADO" }))).toBe(false);
    expect(esFacturaUtil(cfdi("1", { estadoSat: "CANCELANDO" }))).toBe(false);
    expect(esFacturaUtil(cfdi("1", { tipo: null, estadoSat: null }))).toBe(true);
  });
});

describe("sugerirFacturas", () => {
  it("empareja por importe (con tolerancia), moneda y fecha", () => {
    const s = sugerirFacturas([gasto("g1")], [cfdi("c1"), cfdi("c2", { totalCentavos: 700_000 }), cfdi("c3", { moneda: "USD" }), cfdi("c4", { emitidoEn: "2027-03-01" })]);
    expect(s.get("g1")).toMatchObject({ elegida: "c1", segura: true });
    expect(s.get("g1")!.opciones.map((o) => o.cfdiId)).toEqual(["c1"]);
  });
  it("acepta una diferencia de hasta $1.00, no más", () => {
    expect(sugerirFacturas([gasto("g")], [cfdi("c", { totalCentavos: 620_100 })]).get("g")!.elegida).toBe("c");
    expect(sugerirFacturas([gasto("g")], [cfdi("c", { totalCentavos: 620_101 })]).get("g")!.elegida).toBeNull();
  });
  it("la factura puede ser hasta 7 días anterior y 60 posterior al gasto", () => {
    const f = (emitidoEn: string) => sugerirFacturas([gasto("g")], [cfdi("c", { emitidoEn })]).get("g")!.elegida;
    expect(f("2026-10-09")).toBe("c");
    expect(f("2026-10-08")).toBeNull();
    expect(f("2026-12-15")).toBe("c");
    expect(f("2026-12-16")).toBeNull();
  });
  it("entre varias gana la de nombre parecido y fecha cercana; cada factura se usa una vez", () => {
    const gastos = [gasto("g1", { texto: "Hielo Hielera del Puerto" }), gasto("g2", { texto: "Gasolina Pemex Marina", fecha: "2026-10-17" })];
    const facturas = [cfdi("c1", { nombreEmisor: "Pemex Marina SA" }), cfdi("c2", { nombreEmisor: "Hielera del Puerto SA" })];
    const s = sugerirFacturas(gastos, facturas);
    expect(s.get("g1")!.elegida).toBe("c2");
    expect(s.get("g2")!.elegida).toBe("c1");
    expect(s.get("g1")!.segura).toBe(false); // ambas facturas caben en ambos gastos: se pide revisar
    const solo = sugerirFacturas([gasto("a"), gasto("b")], [cfdi("c")]);
    expect([solo.get("a")!.elegida, solo.get("b")!.elegida].filter(Boolean)).toEqual(["c"]);
  });
  it("ignora facturas canceladas o que no son de ingreso", () => {
    expect(sugerirFacturas([gasto("g")], [cfdi("c", { estadoSat: "CANCELADO" }), cfdi("d", { tipo: "P" })]).get("g")!.elegida).toBeNull();
  });
});

describe("motivoIncompatible", () => {
  it("explica por qué no", () => {
    expect(motivoIncompatible({ montoCentavos: 620_000, moneda: "MXN" }, cfdi("c"))).toBeNull();
    expect(motivoIncompatible({ montoCentavos: 620_000, moneda: "MXN" }, cfdi("c", { tipo: "P" }))).toMatch(/ingreso/);
    expect(motivoIncompatible({ montoCentavos: 620_000, moneda: "USD" }, cfdi("c"))).toMatch(/MXN.*USD/);
    expect(motivoIncompatible({ montoCentavos: 100_000, moneda: "MXN" }, cfdi("c"))).toMatch(/no coincide/);
  });
});

describe("leerRecibida", () => {
  it("lee las columnas de Procura, con el importe como número o texto", () => {
    expect(leerRecibida({ id: "x", fiscal_uuid: "U1", issuer_rfc: "AAA010101AAA", issuer_name: "Proveedor", total_minor: "123456", currency: "MXN", issued_at: "2026-10-01T10:00:00.000Z", cfdi_type: "I", sat_status: "VIGENTE", direction: "RECEIVED" }))
      .toEqual({ id: "x", uuid: "U1", rfcEmisor: "AAA010101AAA", nombreEmisor: "Proveedor", totalCentavos: 123_456, moneda: "MXN", emitidoEn: "2026-10-01", tipo: "I", estadoSat: "VIGENTE" });
    expect(leerRecibida({ id: "x", fiscal_uuid: "U1", total_minor: 500, issued_at: "2026-10-01" })?.totalCentavos).toBe(500);
  });
  it("descarta lo emitido por la empresa y lo incompleto", () => {
    expect(leerRecibida({ id: "x", fiscal_uuid: "U", total_minor: 1, issued_at: "2026-10-01", direction: "ISSUED" })).toBeNull();
    expect(leerRecibida({ id: "x", total_minor: 1, issued_at: "2026-10-01" })).toBeNull();
    expect(leerRecibida({ id: "x", fiscal_uuid: "U", issued_at: "2026-10-01" })).toBeNull();
    expect(leerRecibida({ id: "x", fiscal_uuid: "U", total_minor: 1, issued_at: "ayer" })).toBeNull();
    expect(leerRecibida(null)).toBeNull();
  });
});
