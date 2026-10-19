import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { cifrar, descifrar } from "./cifrado";
import { ErrorProcura, crearClienteProcura, leerCfdi, leerVenta } from "./cliente";
import { desglosarIva, errorDeReceptor, estadoDeSat, normalizarRfc, receptorNormalizado } from "@/lib/facturacion/impuestos";

const CLAVE = randomBytes(32).toString("base64");

describe("cifrado de llaves", () => {
  it("ida y vuelta, con un resultado distinto cada vez", () => {
    const a = cifrar("pk_live_secreto", CLAVE), b = cifrar("pk_live_secreto", CLAVE);
    expect(a).not.toBe(b);
    expect(a).not.toContain("secreto");
    expect(descifrar(a, CLAVE)).toBe("pk_live_secreto");
  });
  it("no descifra con otra clave ni si se altera", () => {
    const c = cifrar("pk_live_x", CLAVE);
    expect(() => descifrar(c, randomBytes(32).toString("base64"))).toThrow(/descifrar/);
    const partes = c.split(".");
    partes[3] = Buffer.from("alterado").toString("base64");
    expect(() => descifrar(partes.join("."), CLAVE)).toThrow(/descifrar/);
    expect(() => descifrar("basura", CLAVE)).toThrow(/Formato/);
  });
  it("exige una clave de 32 bytes", () => {
    expect(() => cifrar("x", "corta")).toThrow(/32 bytes/);
    expect(() => cifrar("x", undefined)).toThrow(/PROCURA_CLAVE_CIFRADO/);
  });
});

describe("impuestos y datos fiscales", () => {
  it("el IVA se suma al precio: 1,000.00 → 160.00 → 1,160.00", () => {
    expect(desglosarIva(100_000)).toEqual({ subtotalCentavos: 100_000, ivaCentavos: 16_000, totalCentavos: 116_000 });
    expect(desglosarIva(33_333)).toEqual({ subtotalCentavos: 33_333, ivaCentavos: 5_333, totalCentavos: 38_666 });
    expect(desglosarIva(0).totalCentavos).toBe(0);
  });
  it("valida el receptor", () => {
    const ok = { rfc: "xaxx010101000", razonSocial: "Público en general", regimenFiscal: "616", codigoPostal: "23450", usoCfdi: "s01" };
    expect(errorDeReceptor(ok)).toBeNull();
    expect(errorDeReceptor({ ...ok, rfc: "ABC" })).toMatch(/RFC/);
    expect(errorDeReceptor({ ...ok, razonSocial: " " })).toMatch(/razón social/);
    expect(errorDeReceptor({ ...ok, regimenFiscal: "61" })).toMatch(/régimen/);
    expect(errorDeReceptor({ ...ok, codigoPostal: "2345" })).toMatch(/postal/);
    expect(errorDeReceptor({ ...ok, usoCfdi: "GG3" })).toMatch(/uso/);
    expect(errorDeReceptor({ ...ok, correo: "no-es-correo" })).toMatch(/correo/);
    expect(errorDeReceptor({ ...ok, rfc: "MOGJ800101AB1" })).toBeNull(); // persona física
    expect(errorDeReceptor({ ...ok, rfc: "ABC800101AB1" })).toBeNull(); // persona moral
  });
  it("normaliza el receptor y el estado SAT", () => {
    expect(normalizarRfc(" xaxx 010101 000 ")).toBe("XAXX010101000");
    expect(receptorNormalizado({ rfc: "xaxx010101000", razonSocial: " Cliente ", regimenFiscal: "616", codigoPostal: "23450", usoCfdi: "s01", correo: " " })).toMatchObject({ rfc: "XAXX010101000", razonSocial: "Cliente", usoCfdi: "S01", correo: null });
    expect(estadoDeSat("VIGENTE")).toBe("TIMBRADA");
    expect(estadoDeSat("cancelando")).toBe("CANCELANDO");
    expect(estadoDeSat("CANCELADO")).toBe("CANCELADA");
    expect(estadoDeSat(null)).toBe("TIMBRADA");
  });
});

describe("lectura de respuestas de Procura", () => {
  it("un vínculo usa cfdi_id, no su propio id", () => {
    expect(leerCfdi({ id: "link-1", cfdi_id: "cfdi-9", fiscal_uuid: "U-1", sat_status: "VIGENTE" })).toEqual({ id: "cfdi-9", uuid: "U-1", estadoSat: "VIGENTE" });
    expect(leerCfdi({ id: "cfdi-3", uuid: "U-3" })).toEqual({ id: "cfdi-3", uuid: "U-3", estadoSat: null });
    expect(leerCfdi({})).toBeNull();
  });
  it("venta con líneas y el CFDI más reciente", () => {
    const v = leerVenta({ id: "s1", folio: "7", lines: [{ id: "l1" }, { id: "l2" }], cfdi: [{ id: "v1", cfdi_id: "c1", uuid: "A" }, { cfdi_id: "c2", uuid: "B", sat_status: "VIGENTE" }] });
    expect(v).toEqual({ id: "s1", folio: "7", externalRef: null, lineIds: ["l1", "l2"], cfdi: { id: "c2", uuid: "B", estadoSat: "VIGENTE" } });
    expect(leerVenta({ id: "s2" })).toMatchObject({ lineIds: [], cfdi: null });
    expect(() => leerVenta({})).toThrow(ErrorProcura);
  });
});

function falso(respuestas: { estado: number; cuerpo: unknown }[]) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    const r = respuestas.shift() ?? { estado: 500, cuerpo: {} };
    return new Response(JSON.stringify(r.cuerpo), { status: r.estado, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, llamadas };
}
const nueva = (f: typeof fetch) => crearClienteProcura({ baseUrl: "https://procura.test/", llave: "pk_live_abc", fetch: f });

describe("cliente HTTP de Procura", () => {
  it("crear venta: IVA aparte (una línea con el subtotal y tasa 0.16), llave e idempotencia en los encabezados", async () => {
    const { f, llamadas } = falso([{ estado: 201, cuerpo: { id: "s1", folio: "12", lines: [{ id: "l1" }] } }]);
    const v = await nueva(f).crearVenta({ externalRef: "fn:1", folio: "12", fecha: "2026-10-18", descripcion: "Reserva #12", subtotalCentavos: 100_000, tasaIva: 0.16 }, "idem-1");
    expect(v).toMatchObject({ id: "s1", lineIds: ["l1"] });
    const { url, init } = llamadas[0];
    expect(url).toBe("https://procura.test/api/v1/sales");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer pk_live_abc");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("idem-1");
    expect(JSON.parse(init.body as string)).toMatchObject({ external_ref: "fn:1", folio: "12", currency: "MXN", lines: [{ quantity: 1, unit_price_minor: 100_000, tax_rate: 0.16 }] });
  });
  it("emitir: manda el receptor, la forma y el método de pago y las claves SAT de cada línea", async () => {
    const { f, llamadas } = falso([{ estado: 201, cuerpo: { id: "s1", cfdi: [{ cfdi_id: "c1", uuid: "UUID-1", sat_status: "VIGENTE" }] } }]);
    const cfdi = await nueva(f).emitir("s1", { formaPago: "03", metodoPago: "PUE", receptor: { rfc: "XAXX010101000", razonSocial: "Cliente", regimenFiscal: "616", codigoPostal: "23450", usoCfdi: "S01", correo: "a@b.mx" }, lineas: [{ lineId: "l1", claveProdServ: "90121500", claveUnidad: "E48" }] }, "idem-2");
    expect(cfdi).toEqual({ id: "c1", uuid: "UUID-1", estadoSat: "VIGENTE" });
    expect(llamadas[0].url).toBe("https://procura.test/api/v1/sales/s1/invoice");
    expect(JSON.parse(llamadas[0].init.body as string)).toMatchObject({ payment_form_code: "03", payment_method_code: "PUE", save_recipient: false, recipient: { tax_id: "XAXX010101000", cfdi_use_code: "S01", email: "a@b.mx" }, lines: [{ line_id: "l1", product_code: "90121500", unit_code: "E48" }] });
  });
  it("buscar por referencia y obtener descargas", async () => {
    const { f } = falso([{ estado: 200, cuerpo: { data: [{ id: "s9", external_ref: "fn:1", lines: [] }] } }, { estado: 200, cuerpo: { data: [] } }, { estado: 200, cuerpo: { data: [{ id: "otra", external_ref: "fn:99", lines: [] }] } }, { estado: 200, cuerpo: { id: "c1", uuid: "U", sat_status: "VIGENTE", downloads: { xml_url: "https://x/xml", pdf_url: "https://x/pdf" } } }]);
    const api = nueva(f);
    expect((await api.buscarVentaPorRef("fn:1"))?.id).toBe("s9");
    expect(await api.buscarVentaPorRef("fn:2")).toBeNull();
    // un filtro ignorado por Procura devuelve una venta ajena: no se acepta
    expect(await api.buscarVentaPorRef("fn:3")).toBeNull();
    expect(await api.obtenerCfdi("c1")).toMatchObject({ uuid: "U", xmlUrl: "https://x/xml", pdfUrl: "https://x/pdf" });
  });
  it("cancelar manda el motivo y la confirmación", async () => {
    const { f, llamadas } = falso([{ estado: 200, cuerpo: { id: "c1", sat_status: "CANCELANDO" } }]);
    expect(await nueva(f).cancelar("c1", { motivo: "02" }, "idem-3")).toEqual({ estadoSat: "CANCELANDO" });
    expect(JSON.parse(llamadas[0].init.body as string)).toEqual({ reason_code: "02", confirm: true });
  });
  it("traduce los errores a mensajes seguros, sin la llave y marcando los transitorios", async () => {
    const caso = async (estado: number, cuerpo: unknown = {}) => {
      const { f } = falso([{ estado, cuerpo }]);
      return nueva(f).obtenerCfdi("c1").catch((e) => e as ErrorProcura);
    };
    expect(await caso(401)).toMatchObject({ codigo: "AUTENTICACION", transitorio: false });
    expect(await caso(402)).toMatchObject({ codigo: "PLAN" });
    expect(await caso(409, { code: "ALREADY_INVOICED" })).toMatchObject({ codigo: "CONFLICTO", message: "Esta venta ya tiene una factura." });
    expect(await caso(422, { detail: "El RFC no existe en la lista del SAT" })).toMatchObject({ codigo: "VALIDACION", message: "El RFC no existe en la lista del SAT" });
    expect(await caso(429)).toMatchObject({ codigo: "LIMITE", transitorio: true });
    expect(await caso(502, { detail: "Fiscalapi: token pk_live_abc inválido" })).toMatchObject({ codigo: "PROVEEDOR", transitorio: true });
    const e = (await caso(502, { detail: "token pk_live_abc" })) as ErrorProcura;
    expect(e.message).not.toContain("pk_live");
  });
  it("listar recibidas pagina por cursor, usa los filtros de fecha y descarta lo que no es una factura recibida", async () => {
    const f1 = { id: "a", fiscal_uuid: "UA", total_minor: "100", issued_at: "2026-10-01", direction: "RECEIVED" }, f2 = { id: "b", fiscal_uuid: "UB", total_minor: 200, issued_at: "2026-10-02" };
    const { f, llamadas } = falso([{ estado: 200, cuerpo: { data: [f1, { id: "basura" }], next_cursor: "c2" } }, { estado: 200, cuerpo: { data: [f2], next_cursor: null } }]);
    const r = await nueva(f).listarRecibidas({ desde: "2026-09-01", hasta: "2026-10-31" });
    expect(r.map((x) => x.uuid)).toEqual(["UA", "UB"]);
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0].url).toContain("direction=RECEIVED");
    expect(llamadas[0].url).toContain("from=2026-09-01");
    expect(llamadas[1].url).toContain("cursor=c2");
  });
  it("listar recibidas respeta el tope y obtenerRecibida lee una sola", async () => {
    const pagina = (n: number) => ({ estado: 200, cuerpo: { data: Array.from({ length: 3 }, (_, i) => ({ id: `${n}${i}`, fiscal_uuid: `U${n}${i}`, total_minor: 1, issued_at: "2026-10-01" })), next_cursor: `c${n + 1}` } });
    const { f } = falso([pagina(1), pagina(2), pagina(3)]);
    expect(await nueva(f).listarRecibidas({ maximo: 5 })).toHaveLength(5);
    const uno = falso([{ estado: 200, cuerpo: { id: "z", fiscal_uuid: "UZ", total_minor: 9, issued_at: "2026-10-05" } }]);
    expect(await nueva(uno.f).obtenerRecibida("z")).toMatchObject({ uuid: "UZ", totalCentavos: 9 });
  });
  it("un fallo de red es transitorio y la prueba de conexión no lanza", async () => {
    const f = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    const api = nueva(f);
    await expect(api.obtenerCfdi("c1")).rejects.toMatchObject({ codigo: "PROVEEDOR", transitorio: true });
    expect(await api.probarConexion()).toMatchObject({ ok: false });
    const bien = falso([{ estado: 200, cuerpo: {} }]);
    expect(await nueva(bien.f).probarConexion()).toEqual({ ok: true });
  });
});
