import type { Receptor } from "@/lib/facturacion/impuestos";

// Cliente HTTP de Procura (servidor a servidor). Nunca registra ni devuelve la llave; traduce los errores a mensajes seguros.

export class ErrorProcura extends Error {
  constructor(mensaje: string, readonly codigo: "AUTENTICACION" | "PLAN" | "CONFLICTO" | "VALIDACION" | "LIMITE" | "PROVEEDOR" | "RESPUESTA", readonly transitorio = false) {
    super(mensaje);
  }
}

export type VentaProcura = { id: string; folio: string | null; externalRef: string | null; lineIds: string[]; cfdi: CfdiProcura | null };
export type CfdiProcura = { id: string; uuid: string | null; estadoSat: string | null };
export type DescargasCfdi = { xmlUrl: string | null; pdfUrl: string | null };

export interface ApiProcura {
  crearVenta(e: { externalRef: string; folio?: string; fecha: string; descripcion: string; subtotalCentavos: number; tasaIva: number; notas?: string }, idempotencia: string): Promise<VentaProcura>;
  buscarVentaPorRef(externalRef: string): Promise<VentaProcura | null>;
  emitir(ventaId: string, e: { formaPago: string; metodoPago: "PUE" | "PPD"; receptor: Receptor; lineas: { lineId: string; claveProdServ?: string | null; claveUnidad?: string | null }[] }, idempotencia: string): Promise<CfdiProcura>;
  obtenerCfdi(cfdiId: string): Promise<CfdiProcura & DescargasCfdi>;
  cancelar(cfdiId: string, e: { motivo: "01" | "02" | "03"; uuidSustituto?: string }, idempotencia: string): Promise<{ estadoSat: string | null }>;
  refrescarEstado(cfdiId: string): Promise<{ estadoSat: string | null }>;
  probarConexion(): Promise<{ ok: boolean; mensaje?: string }>;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Un CFDI en cualquiera de las formas que Procura lo expone (`id`/`cfdi_id`, `uuid`/`fiscal_uuid`, `sat_status`). */
export function leerCfdi(v: unknown): CfdiProcura | null {
  const o = obj(v);
  const id = str(o.cfdi_id) ?? str(o.id); // un vínculo trae `cfdi_id` (y su propio `id`); el comprobante trae solo `id`
  if (!id) return null;
  return { id, uuid: str(o.uuid) ?? str(o.fiscal_uuid), estadoSat: str(o.sat_status) ?? str(o.status) };
}

/** Del cuerpo de una venta de Procura: su id, folio, ids de líneas y el CFDI más reciente si ya tiene. */
export function leerVenta(v: unknown): VentaProcura {
  const o = obj(v), id = str(o.id);
  if (!id) throw new ErrorProcura("Procura respondió algo inesperado.", "RESPUESTA");
  const lineIds = (Array.isArray(o.lines) ? o.lines : []).map((l) => str(obj(l).id)).filter((x): x is string => !!x);
  const cfdis = (Array.isArray(o.cfdi) ? o.cfdi : []).map((c) => leerCfdi(obj(c).cfdi ?? c)).filter((x): x is CfdiProcura => !!x);
  return { id, folio: str(o.folio), externalRef: str(o.external_ref), lineIds, cfdi: cfdis[cfdis.length - 1] ?? null };
}

async function problema(res: Response): Promise<{ codigo: string | null; detalle: string | null }> {
  try { const j = obj(await res.json()); return { codigo: str(j.code), detalle: str(j.detail) ?? str(j.title) }; } catch { return { codigo: null, detalle: null }; }
}

export function crearClienteProcura(cfg: { baseUrl: string; llave: string; fetch?: typeof fetch; timeoutMs?: number }): ApiProcura {
  const f = cfg.fetch ?? fetch, base = cfg.baseUrl.replace(/\/+$/, "");

  async function llamar(metodo: "GET" | "POST", ruta: string, o: { cuerpo?: unknown; idempotencia?: string } = {}): Promise<{ estado: number; json: unknown }> {
    let res: Response;
    try {
      res = await f(`${base}/api/v1${ruta}`, {
        method: metodo, cache: "no-store", signal: AbortSignal.timeout(cfg.timeoutMs ?? 30_000),
        headers: { authorization: `Bearer ${cfg.llave}`, accept: "application/json", ...(o.cuerpo !== undefined ? { "content-type": "application/json" } : {}), ...(o.idempotencia ? { "idempotency-key": o.idempotencia } : {}) },
        body: o.cuerpo !== undefined ? JSON.stringify(o.cuerpo) : undefined,
      });
    } catch {
      throw new ErrorProcura("No se pudo contactar a Procura. Intenta de nuevo en un momento.", "PROVEEDOR", true);
    }
    if (res.ok) return { estado: res.status, json: await res.json().catch(() => ({})) };
    const { codigo, detalle } = await problema(res);
    if (res.status === 401 || res.status === 403) throw new ErrorProcura("La conexión con Procura no tiene permiso para esta operación. Avisa a soporte.", "AUTENTICACION");
    if (res.status === 402) throw new ErrorProcura("El plan de Procura de esta empresa no incluye facturación o no está activo. Avisa a soporte.", "PLAN");
    if (res.status === 404) throw new ErrorProcura("Procura no encontró el registro.", "CONFLICTO");
    if (res.status === 409) throw new ErrorProcura(codigo === "ALREADY_INVOICED" ? "Esta venta ya tiene una factura." : (detalle ?? "El emisor fiscal no está listo o hay un conflicto en Procura.").slice(0, 300), "CONFLICTO");
    if (res.status === 422 || res.status === 400) throw new ErrorProcura((detalle ?? "Procura rechazó los datos de la factura.").slice(0, 300), "VALIDACION");
    if (res.status === 429) throw new ErrorProcura("Procura está recibiendo demasiadas peticiones. Intenta de nuevo en unos minutos.", "LIMITE", true);
    throw new ErrorProcura("Procura o el proveedor fiscal no respondieron bien. Intenta de nuevo en un momento.", "PROVEEDOR", true);
  }

  return {
    async crearVenta(e, idempotencia) {
      const { json } = await llamar("POST", "/sales", {
        idempotencia,
        cuerpo: {
          sold_at: e.fecha, description: e.descripcion, currency: "MXN", external_ref: e.externalRef, ...(e.folio ? { folio: e.folio } : {}), ...(e.notas ? { notes: e.notas } : {}),
          // El precio de FleetNautic es sin IVA: una línea con el subtotal y la tasa; Procura suma el impuesto
          lines: [{ description: e.descripcion, quantity: 1, unit_price_minor: e.subtotalCentavos, discount_minor: 0, tax_rate: e.tasaIva }],
        },
      });
      return leerVenta(json);
    },
    async buscarVentaPorRef(externalRef) {
      const { json } = await llamar("GET", `/sales?external_ref=${encodeURIComponent(externalRef)}`);
      const lista = Array.isArray(obj(json).data) ? (obj(json).data as unknown[]) : [];
      // Si Procura ignora el filtro (aún no lo soporta) devolvería cualquier venta: solo vale la que trae EXACTAMENTE esa referencia
      return lista.map(leerVenta).find((v) => v.externalRef === externalRef) ?? null;
    },
    async emitir(ventaId, e, idempotencia) {
      const { json } = await llamar("POST", `/sales/${encodeURIComponent(ventaId)}/invoice`, {
        idempotencia,
        cuerpo: {
          payment_form_code: e.formaPago, payment_method_code: e.metodoPago, save_recipient: false,
          recipient: { tax_id: e.receptor.rfc, legal_name: e.receptor.razonSocial, tax_regime_code: e.receptor.regimenFiscal, zip_code: e.receptor.codigoPostal, cfdi_use_code: e.receptor.usoCfdi, ...(e.receptor.correo ? { email: e.receptor.correo } : {}) },
          lines: e.lineas.map((l) => ({ line_id: l.lineId, ...(l.claveProdServ ? { product_code: l.claveProdServ } : {}), ...(l.claveUnidad ? { unit_code: l.claveUnidad } : {}) })),
        },
      });
      const cfdi = leerVenta(json).cfdi ?? leerCfdi(json);
      if (!cfdi) throw new ErrorProcura("Procura timbró pero no devolvió el comprobante. Revisa el estado en unos minutos.", "RESPUESTA", true);
      return cfdi;
    },
    async obtenerCfdi(cfdiId) {
      const { json } = await llamar("GET", `/cfdi/${encodeURIComponent(cfdiId)}`);
      const c = leerCfdi(json), d = obj(obj(json).downloads);
      if (!c) throw new ErrorProcura("Procura respondió algo inesperado.", "RESPUESTA");
      return { ...c, xmlUrl: str(d.xml_url), pdfUrl: str(d.pdf_url) };
    },
    async cancelar(cfdiId, e, idempotencia) {
      const { json } = await llamar("POST", `/cfdi/${encodeURIComponent(cfdiId)}/cancel`, { idempotencia, cuerpo: { reason_code: e.motivo, ...(e.uuidSustituto ? { replacement_uuid: e.uuidSustituto } : {}), confirm: true } });
      return { estadoSat: leerCfdi(json)?.estadoSat ?? "CANCELANDO" };
    },
    async refrescarEstado(cfdiId) {
      const { json } = await llamar("POST", `/cfdi/${encodeURIComponent(cfdiId)}/refresh-status`, { idempotencia: crypto.randomUUID(), cuerpo: {} });
      return { estadoSat: leerCfdi(json)?.estadoSat ?? str(obj(json).sat_status) };
    },
    async probarConexion() {
      try { await llamar("GET", "/fiscal/provider"); return { ok: true }; }
      catch (e) { return { ok: false, mensaje: e instanceof ErrorProcura ? e.message : "No se pudo probar la conexión." }; }
    },
  };
}
