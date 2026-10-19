import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { crearReservaTx } from "@/lib/reservas/crear";
import { asegurarCategoriasBase } from "@/lib/finanzas/servicio";
import { cifrar } from "@/lib/procura/cifrado";
import { ErrorProcura, type ApiProcura, type CfdiProcura, type VentaProcura } from "@/lib/procura/cliente";
import { ErrorFacturacion, apiDeEmpresa, cancelarFactura, datosParaFacturar, refrescarFactura, solicitarFactura, type Deps } from "@/lib/facturacion/servicio";
import type { Receptor } from "@/lib/facturacion/impuestos";

// Requiere Postgres local migrado (npm run test:db lo prepara).
process.env.PROCURA_CLAVE_CIFRADO = randomBytes(32).toString("base64");
const sfx = Math.random().toString(36).slice(2, 8);
type Ctx = { t: string; reserva: string; traslado: string; cliente: string };
const F = "2031-08-10";
const RECEPTOR: Receptor = { rfc: "XAXX010101000", razonSocial: "Público en general", regimenFiscal: "616", codigoPostal: "23450", usoCfdi: "S01", correo: "cliente@correo.mx" };

/** Procura de mentira: registra lo que se le pide y permite fallar a voluntad. */
class FalsaProcura implements ApiProcura {
  ventas = new Map<string, VentaProcura & { subtotal: number }>();
  llamadas: string[] = [];
  fallarEmitir: ErrorProcura | null = null;
  perderRespuesta = false;
  estadoSat = "VIGENTE";
  async crearVenta(e: Parameters<ApiProcura["crearVenta"]>[0]) {
    this.llamadas.push("crearVenta");
    const v = { id: `s${this.ventas.size + 1}`, folio: e.folio ?? null, externalRef: e.externalRef, lineIds: ["l1"], cfdi: null, subtotal: e.subtotalCentavos };
    this.ventas.set(e.externalRef, v);
    return v;
  }
  async buscarVentaPorRef(ref: string) { this.llamadas.push("buscar"); return this.ventas.get(ref) ?? null; }
  async emitir(ventaId: string, e: Parameters<ApiProcura["emitir"]>[1]): Promise<CfdiProcura> {
    this.llamadas.push(`emitir:${e.formaPago}:${e.metodoPago}:${e.lineas[0].claveProdServ}`);
    if (this.fallarEmitir) throw this.fallarEmitir;
    const cfdi = { id: `c-${ventaId}`, uuid: `UUID-${ventaId}`, estadoSat: "VIGENTE" };
    const v = [...this.ventas.values()].find((x) => x.id === ventaId)!;
    v.cfdi = cfdi; // el timbrado ocurrió, aunque la respuesta se pierda
    if (this.perderRespuesta) throw new ErrorProcura("Tiempo de espera agotado.", "PROVEEDOR", true);
    return cfdi;
  }
  async obtenerCfdi(id: string) { return { id, uuid: "U", estadoSat: this.estadoSat, xmlUrl: "https://x/xml", pdfUrl: "https://x/pdf" }; }
  async cancelar() { this.llamadas.push("cancelar"); this.estadoSat = "CANCELANDO"; return { estadoSat: "CANCELANDO" }; }
  async refrescarEstado() { return { estadoSat: this.estadoSat }; }
  async probarConexion() { return { ok: true }; }
}

async function crearTenant(nombre: string, o: { conexion?: boolean; clave?: boolean } = {}): Promise<Ctx> {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}`, moneda: "MXN" } });
  return withTenant(t.id, async (tx) => {
    await asegurarCategoriasBase(tx, t.id);
    const emb = await tx.embarcacion.create({ data: { tenantId: t.id, nombre: "Alfa", tipo: "YATE", capacidad: 20 } });
    const cli = await tx.cliente.create({ data: { tenantId: t.id, nombre: "Laura Gómez", email: "laura@correo.mx", rfc: RECEPTOR.rfc, razonSocialFiscal: RECEPTOR.razonSocial, regimenFiscal: RECEPTOR.regimenFiscal, codigoPostalFiscal: RECEPTOR.codigoPostal, usoCfdi: RECEPTOR.usoCfdi } });
    const r = await crearReservaTx(tx, { tenantId: t.id, embarcacionId: emb.id, clienteId: cli.id, fecha: F, inicioMin: 600, finMin: 780, pax: 4, origen: "DIRECTO", totalCentavos: 500_000 });
    await tx.pago.create({ data: { tenantId: t.id, reservaId: r.id, montoCentavos: 500_000, metodo: "TRANSFERENCIA" } });
    const cuenta = await tx.cuenta.create({ data: { tenantId: t.id, nombre: "Caja", tipo: "EFECTIVO", moneda: "MXN" } });
    const ing = await tx.ingreso.create({ data: { tenantId: t.id, concepto: "Traslado", cuentaId: cuenta.id, montoCentavos: 80_000, moneda: "MXN", montoBaseCentavos: 80_000, fecha: new Date(F), origen: "TRANSPORTE" } });
    const tr = await tx.traslado.create({ data: { tenantId: t.id, reservaId: r.id, tipo: "IDA", fecha: new Date(F), horaMin: 480, origen: "Hotel", destino: "Marina", pax: 4, precioCentavos: 80_000, ingresoId: ing.id } });
    if (o.conexion !== false) await tx.conexionProcura.create({ data: { tenantId: t.id, llaveCifrada: cifrar("pk_live_prueba"), claveProdServ: o.clave === false ? null : "90121500" } });
    return { t: t.id, reserva: r.id, traslado: tr.id, cliente: cli.id };
  });
}
const deps = (x: Ctx, api: FalsaProcura): Deps => ({ tenantId: x.t, usuarioId: "u1", db: (fn) => withTenant(x.t, fn), api });
const pedir = (x: Ctx, api: FalsaProcura, o: Partial<Parameters<typeof solicitarFactura>[1]> = {}) =>
  solicitarFactura(deps(x, api), { origen: { tipo: "RESERVA", id: x.reserva }, receptor: RECEPTOR, formaPago: "03", metodoPago: "PUE", ...o });
const facturas = (x: Ctx) => withTenant(x.t, (tx) => tx.facturaEmitida.findMany({ orderBy: { creadoEn: "asc" } }));
let A: Ctx, B: Ctx;

beforeAll(async () => { A = await crearTenant("fa"); B = await crearTenant("fb"); });
afterAll(async () => { await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } }); await prisma.$disconnect(); });

describe("emitir la factura de una reserva", () => {
  it("el IVA se suma al precio, se manda la clave SAT y queda timbrada", async () => {
    const T = await crearTenant("f1");
    const api = new FalsaProcura();
    const f = await pedir(T, api);
    expect(f).toMatchObject({ subtotalCentavos: 500_000, ivaCentavos: 80_000, totalCentavos: 580_000, estado: "TIMBRADA", uuid: "UUID-s1", formaPago: "03", metodoPago: "PUE" });
    expect(api.llamadas).toEqual(["buscar", "crearVenta", "emitir:03:PUE:90121500"]);
    expect(api.ventas.get(`fn:${f.id}`)).toMatchObject({ folio: "1", subtotal: 500_000 });
    expect(f.receptor).toMatchObject({ rfc: "XAXX010101000", usoCfdi: "S01" });
  });
  it("exige que esté cobrada, que no esté cancelada y que haya datos fiscales válidos", async () => {
    const T = await crearTenant("f2");
    await withTenant(T.t, (tx) => tx.pago.deleteMany({}));
    await expect(pedir(T, new FalsaProcura())).rejects.toThrow(/no está cobrada/);
    await withTenant(T.t, (tx) => tx.reserva.update({ where: { id: T.reserva }, data: { estado: "CANCELADA" } }));
    await expect(pedir(T, new FalsaProcura())).rejects.toThrow(/cancelada/);
    const U = await crearTenant("f2b");
    await expect(pedir(U, new FalsaProcura(), { receptor: { ...RECEPTOR, rfc: "ABC" } })).rejects.toThrow(/RFC/);
    await expect(pedir(U, new FalsaProcura(), { formaPago: "" })).rejects.toThrow(/forma de pago/);
    expect(await facturas(U)).toHaveLength(0); // nada se reservó
  });
  it("sin conexión o sin clave SAT no se puede facturar", async () => {
    const sinConexion = await crearTenant("f3", { conexion: false });
    await expect(pedir(sinConexion, new FalsaProcura())).rejects.toThrow(/no está conectada/);
    const sinClave = await crearTenant("f3b", { clave: false });
    await expect(pedir(sinClave, new FalsaProcura())).rejects.toThrow(/clave de producto/);
  });
  it("una sola factura viva por reserva; una cancelada deja facturar de nuevo", async () => {
    const T = await crearTenant("f4");
    const api = new FalsaProcura();
    await pedir(T, api);
    await expect(pedir(T, api)).rejects.toThrow(/Ya existe una factura/);
    const [f] = await facturas(T);
    await cancelarFactura(deps(T, api), f.id, { motivo: "02" });
    await refrescarFactura(deps(T, api), f.id); // CANCELANDO todavía
    api.estadoSat = "CANCELADO";
    expect((await refrescarFactura(deps(T, api), f.id)).estado).toBe("CANCELADA");
    const otra = await pedir(T, new FalsaProcura());
    expect(otra.id).not.toBe(f.id);
    expect(await facturas(T)).toHaveLength(2);
  });
  it("dos solicitudes simultáneas: solo una factura", async () => {
    const T = await crearTenant("f5");
    const api = new FalsaProcura();
    const r = await Promise.allSettled([pedir(T, api), pedir(T, api), pedir(T, api)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await facturas(T)).toHaveLength(1);
  });
});

describe("fallos y reintentos", () => {
  it("un error del proveedor deja la factura en ERROR y reintentar reutiliza la misma venta, sin duplicar", async () => {
    const T = await crearTenant("f6");
    const api = new FalsaProcura();
    api.fallarEmitir = new ErrorProcura("Procura o el proveedor fiscal no respondieron bien.", "PROVEEDOR", true);
    await expect(pedir(T, api)).rejects.toThrow(ErrorFacturacion);
    const [f1] = await facturas(T);
    expect(f1).toMatchObject({ estado: "ERROR", procuraSaleId: "s1" });
    expect(f1.error).toMatch(/reintentar/);
    api.fallarEmitir = null;
    const f2 = await pedir(T, api);
    expect(f2.id).toBe(f1.id);
    expect(f2.estado).toBe("TIMBRADA");
    expect(api.llamadas.filter((l) => l === "crearVenta")).toHaveLength(1);
    expect(await facturas(T)).toHaveLength(1);
  });
  it("si se pierde la respuesta del timbrado, reintentar recupera el CFDI sin timbrar otra vez", async () => {
    const T = await crearTenant("f7");
    const api = new FalsaProcura();
    api.perderRespuesta = true;
    await expect(pedir(T, api)).rejects.toThrow(ErrorFacturacion);
    api.perderRespuesta = false;
    const f = await pedir(T, api);
    expect(f).toMatchObject({ estado: "TIMBRADA", uuid: "UUID-s1" });
    expect(api.llamadas.filter((l) => l.startsWith("emitir"))).toHaveLength(1);
  });
  it("un error de validación no es transitorio y no promete reintento", async () => {
    const T = await crearTenant("f8");
    const api = new FalsaProcura();
    api.fallarEmitir = new ErrorProcura("El RFC no existe en la lista del SAT", "VALIDACION");
    await expect(pedir(T, api)).rejects.toThrow(/RFC no existe/);
    expect((await facturas(T))[0].error).toBe("El RFC no existe en la lista del SAT");
  });
  it("una solicitud atorada en proceso se puede reintentar pasado el tiempo; una reciente no", async () => {
    const T = await crearTenant("f9");
    const api = new FalsaProcura();
    api.fallarEmitir = new ErrorProcura("x", "PROVEEDOR", true);
    await expect(pedir(T, api)).rejects.toThrow();
    const [f] = await facturas(T);
    await withTenant(T.t, (tx) => tx.facturaEmitida.update({ where: { id: f.id }, data: { estado: "SOLICITADA" } }));
    api.fallarEmitir = null;
    await expect(pedir(T, api)).rejects.toThrow(/se está procesando/);
    await withTenant(T.t, (tx) => tx.$executeRaw`UPDATE "FacturaEmitida" SET "actualizadoEn" = now() - interval '5 minutes' WHERE id = ${f.id}`);
    expect((await pedir(T, api)).estado).toBe("TIMBRADA");
  });
});

describe("traslados, cancelación y descargas", () => {
  it("factura un traslado cobrado con la forma de pago de su cuenta y exige que esté cobrado", async () => {
    const T = await crearTenant("g1");
    const datos = await withTenant(T.t, (tx) => datosParaFacturar(tx, { tipo: "TRASLADO", id: T.traslado }));
    expect(datos).toMatchObject({ subtotalCentavos: 80_000, cobrado: true, formaPagoSugerida: "01", metodoPagoSugerido: "PUE" });
    const f = await pedir(T, new FalsaProcura(), { origen: { tipo: "TRASLADO", id: T.traslado }, formaPago: "01" });
    expect(f).toMatchObject({ trasladoId: T.traslado, reservaId: null, subtotalCentavos: 80_000, ivaCentavos: 12_800, totalCentavos: 92_800 });
    const U = await crearTenant("g1b");
    await withTenant(U.t, (tx) => tx.traslado.update({ where: { id: U.traslado }, data: { ingresoId: null } }));
    await expect(pedir(U, new FalsaProcura(), { origen: { tipo: "TRASLADO", id: U.traslado } })).rejects.toThrow(/no está cobrado/);
  });
  it("la cancelación exige estar timbrada y, con motivo 01, el UUID que la sustituye", async () => {
    const T = await crearTenant("g2");
    const api = new FalsaProcura();
    const f = await pedir(T, api);
    await expect(cancelarFactura(deps(T, api), f.id, { motivo: "01" })).rejects.toThrow(/UUID/);
    expect((await cancelarFactura(deps(T, api), f.id, { motivo: "01", uuidSustituto: "UUID-NUEVO" })).estado).toBe("CANCELANDO");
    await expect(cancelarFactura(deps(T, api), f.id, { motivo: "02" })).rejects.toThrow(/timbrada y vigente/);
    await expect(cancelarFactura(deps(T, api), "inexistente", { motivo: "02" })).rejects.toThrow(/no existe/);
  });
});

describe("conexión y aislamiento", () => {
  it("la llave se guarda cifrada y solo se descifra para armar el cliente", async () => {
    const c = await withTenant(A.t, (tx) => tx.conexionProcura.findUniqueOrThrow({ where: { tenantId: A.t } }));
    expect(c.llaveCifrada).not.toContain("pk_live");
    process.env.PROCURA_API_URL = "https://procura.test";
    await expect(withTenant(A.t, (tx) => apiDeEmpresa(tx, A.t))).resolves.toBeTruthy();
    delete process.env.PROCURA_API_URL;
    await expect(withTenant(A.t, (tx) => apiDeEmpresa(tx, A.t))).rejects.toThrow(/no está configurada/);
    const sin = await crearTenant("g3", { conexion: false });
    await expect(withTenant(sin.t, (tx) => apiDeEmpresa(tx, sin.t))).rejects.toThrow(/no está conectada/);
  });
  it("una empresa no ve las facturas ni la conexión de otra (RLS)", async () => {
    await pedir(B, new FalsaProcura());
    expect((await facturas(A)).every((f) => f.tenantId === A.t)).toBe(true);
    expect(await withTenant(A.t, (tx) => tx.conexionProcura.findMany())).toHaveLength(1);
    await expect(withTenant(A.t, (tx) => datosParaFacturar(tx, { tipo: "RESERVA", id: B.reserva }))).rejects.toThrow(/no existe/);
  });
});
