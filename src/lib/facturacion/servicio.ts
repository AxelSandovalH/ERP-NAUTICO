import type { FacturaEmitida, Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db/tenant";
import { aIso } from "@/lib/fechas";
import { descifrar } from "@/lib/procura/cifrado";
import { ErrorProcura, crearClienteProcura, type ApiProcura } from "@/lib/procura/cliente";
import { FORMA_PAGO_SAT, TASA_IVA, desglosarIva, errorDeReceptor, estadoDeSat, receptorNormalizado, type Receptor } from "./impuestos";

export class ErrorFacturacion extends Error {}

export type Origen = { tipo: "RESERVA" | "TRASLADO"; id: string };
export type Deps = { tenantId: string; usuarioId?: string; db: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>; api: ApiProcura };

/** Pasado este tiempo, una solicitud que quedó «en proceso» se considera atorada y se puede reintentar. */
export const MINUTOS_ATORADA = 2;

// ─── conexión ────────────────────────────────────────────────────────────────

/** Cliente de Procura de la empresa, con su llave descifrada solo en memoria. */
export async function apiDeEmpresa(tx: Tx, tenantId: string): Promise<ApiProcura> {
  const c = await tx.conexionProcura.findUnique({ where: { tenantId } });
  if (!c || !c.activa) throw new ErrorFacturacion("La facturación aún no está conectada. Avisa a soporte.");
  const base = process.env.PROCURA_API_URL;
  if (!base) throw new ErrorFacturacion("La conexión con Procura no está configurada en el servidor.");
  return crearClienteProcura({ baseUrl: base, llave: descifrar(c.llaveCifrada) });
}

// ─── qué se factura ──────────────────────────────────────────────────────────

export type DatosFactura = {
  origen: Origen; clienteId: string; descripcion: string; fecha: string; subtotalCentavos: number; cobrado: boolean; motivoNoCobrado?: string;
  formaPagoSugerida: string; metodoPagoSugerido: "PUE" | "PPD"; folio: string | null;
  cliente: { id: string; nombre: string; rfc: string | null; razonSocialFiscal: string | null; regimenFiscal: string | null; codigoPostalFiscal: string | null; usoCfdi: string | null; correoFactura: string | null; email: string | null };
};

const forma = (m: string | undefined) => (m && m in FORMA_PAGO_SAT ? FORMA_PAGO_SAT[m as keyof typeof FORMA_PAGO_SAT] : "03");
const MAPA_CUENTA: Record<string, string> = { EFECTIVO: "01", TARJETA_CREDITO: "04", BANCO: "03", PASARELA: "04", OTRA: "03" };

/** Lo que se factura de una reserva o de un traslado: el precio SIN IVA, a quién y si ya está cobrado. */
export async function datosParaFacturar(tx: Tx, origen: Origen): Promise<DatosFactura> {
  if (origen.tipo === "RESERVA") {
    const r = await tx.reserva.findUnique({ where: { id: origen.id }, include: { cliente: true, embarcacion: true, pagos: true } });
    if (!r) throw new ErrorFacturacion("La reserva no existe.");
    const pagado = r.pagos.reduce((s, p) => s + p.montoCentavos, 0);
    const mayor = [...r.pagos].sort((a, b) => b.montoCentavos - a.montoCentavos)[0];
    const cobrado = r.estado !== "CANCELADA" && r.totalCentavos > 0 && pagado >= r.totalCentavos;
    return {
      origen, clienteId: r.clienteId, cliente: r.cliente, folio: String(r.folio), fecha: aIso(r.fecha), subtotalCentavos: r.totalCentavos,
      descripcion: `Reserva #${r.folio} · ${r.embarcacion.nombre} · ${aIso(r.fecha)}`.slice(0, 300), cobrado,
      motivoNoCobrado: r.estado === "CANCELADA" ? "La reserva está cancelada." : r.totalCentavos <= 0 ? "La reserva no tiene importe." : "La reserva aún no está cobrada por completo.",
      formaPagoSugerida: forma(mayor?.metodo), metodoPagoSugerido: cobrado ? "PUE" : "PPD",
    };
  }
  const t = await tx.traslado.findUnique({ where: { id: origen.id }, include: { reserva: { include: { cliente: true } }, ingreso: { include: { cuenta: true } } } });
  if (!t) throw new ErrorFacturacion("El traslado no existe.");
  const cobrado = t.estado !== "CANCELADO" && !!t.ingresoId && t.ingreso?.estado === "ACTIVO" && t.precioCentavos > 0;
  return {
    origen, clienteId: t.reserva.clienteId, cliente: t.reserva.cliente, folio: null, fecha: aIso(t.fecha), subtotalCentavos: t.precioCentavos,
    descripcion: `Traslado ${t.tipo === "IDA" ? "de ida" : "de regreso"} · Reserva #${t.reserva.folio} · ${aIso(t.fecha)}`.slice(0, 300), cobrado,
    motivoNoCobrado: t.estado === "CANCELADO" ? "El traslado está cancelado." : t.precioCentavos <= 0 ? "El traslado no tiene precio." : "El traslado aún no está cobrado.",
    formaPagoSugerida: MAPA_CUENTA[t.ingreso?.cuenta.tipo ?? ""] ?? "03", metodoPagoSugerido: cobrado ? "PUE" : "PPD",
  };
}

export const receptorDeCliente = (c: DatosFactura["cliente"]): Partial<Receptor> => ({
  rfc: c.rfc ?? "", razonSocial: c.razonSocialFiscal ?? "", regimenFiscal: c.regimenFiscal ?? "", codigoPostal: c.codigoPostalFiscal ?? "", usoCfdi: c.usoCfdi ?? "", correo: c.correoFactura ?? c.email,
});

// ─── emitir ──────────────────────────────────────────────────────────────────

const VIVAS = ["SOLICITADA", "TIMBRADA", "CANCELANDO"] as const;

/** Reserva el intento en la base de datos (una sola factura viva por origen) antes de hablar con Procura. */
async function reservarSolicitud(d: Deps, e: { origen: Origen; receptor: Receptor; formaPago: string; metodoPago: "PUE" | "PPD" }) {
  return d.db(async (tx) => {
    const conexion = await tx.conexionProcura.findUnique({ where: { tenantId: d.tenantId } });
    if (!conexion || !conexion.activa) throw new ErrorFacturacion("La facturación aún no está conectada. Avisa a soporte.");
    if (!conexion.claveProdServ) throw new ErrorFacturacion("Falta la clave de producto o servicio del SAT con que se facturan tus servicios. Avisa a soporte.");
    const datos = await datosParaFacturar(tx, e.origen);
    if (!datos.cobrado) throw new ErrorFacturacion(datos.motivoNoCobrado ?? "Aún no está cobrado.");
    const err = errorDeReceptor(e.receptor);
    if (err) throw new ErrorFacturacion(err);
    if (!/^\d{2}$/.test(e.formaPago)) throw new ErrorFacturacion("Elige la forma de pago.");
    const donde = e.origen.tipo === "RESERVA" ? { reservaId: e.origen.id } : { trasladoId: e.origen.id };
    const previas = await tx.facturaEmitida.findMany({ where: donde, orderBy: { creadoEn: "desc" } });
    const viva = previas.find((f) => (VIVAS as readonly string[]).includes(f.estado));
    if (viva) {
      const atorada = viva.estado === "SOLICITADA" && Date.now() - viva.actualizadoEn.getTime() > MINUTOS_ATORADA * 60_000;
      if (!atorada) throw new ErrorFacturacion(viva.estado === "SOLICITADA" ? "La factura ya se está procesando. Espera un momento." : "Ya existe una factura de esto. Cancélala antes de emitir otra.");
    }
    const importes = desglosarIva(datos.subtotalCentavos);
    const receptor = receptorNormalizado(e.receptor);
    const reintento = viva ?? previas.find((f) => f.estado === "ERROR");
    const base = { ...importes, formaPago: e.formaPago, metodoPago: e.metodoPago, receptor: receptor as unknown as Prisma.InputJsonValue, estado: "SOLICITADA" as const, error: null };
    const factura = reintento
      ? await tx.facturaEmitida.update({ where: { id: reintento.id }, data: { ...base, solicitadaPorId: d.usuarioId } })
      : await tx.facturaEmitida.create({ data: { tenantId: d.tenantId, clienteId: datos.clienteId, ...donde, ...base, solicitadaPorId: d.usuarioId } });
    return { factura, datos, conexion };
  });
}

const marcarError = (d: Deps, id: string, mensaje: string) => d.db((tx) => tx.facturaEmitida.update({ where: { id }, data: { estado: "ERROR", error: mensaje.slice(0, 500) } }));

/**
 * Pide a Procura que timbre la factura de una reserva o traslado cobrado. El intento se reserva primero en la base de datos;
 * las llamadas a Procura van fuera de una transacción. Reintentar es seguro: la venta se identifica por su referencia y un CFDI ya emitido se recupera.
 */
export async function solicitarFactura(d: Deps, e: { origen: Origen; receptor: Receptor; formaPago: string; metodoPago: "PUE" | "PPD" }): Promise<FacturaEmitida> {
  const { factura, datos, conexion } = await reservarSolicitud(d, e);
  const ref = `fn:${factura.id}`;
  try {
    // 1) La venta en Procura (idempotente por referencia; si ya existe, se reutiliza)
    const venta = (await d.api.buscarVentaPorRef(ref))
      ?? (await d.api.crearVenta({ externalRef: ref, folio: datos.folio ?? undefined, fecha: datos.fecha, descripcion: datos.descripcion, subtotalCentavos: factura.subtotalCentavos, tasaIva: TASA_IVA }, `fn-venta-${factura.id}`));
    await d.db((tx) => tx.facturaEmitida.update({ where: { id: factura.id }, data: { procuraSaleId: venta.id } }));
    // 2) El timbrado (un CFDI ya emitido, por un intento anterior cuya respuesta se perdió, se recupera sin timbrar de nuevo)
    const cfdi = venta.cfdi ?? (await d.api.emitir(venta.id, {
      formaPago: factura.formaPago, metodoPago: factura.metodoPago as "PUE" | "PPD", receptor: factura.receptor as unknown as Receptor,
      lineas: venta.lineIds.map((lineId) => ({ lineId, claveProdServ: conexion.claveProdServ, claveUnidad: conexion.claveUnidad })),
    }, `fn-factura-${factura.id}`));
    return await d.db((tx) => tx.facturaEmitida.update({ where: { id: factura.id }, data: { procuraCfdiId: cfdi.id, uuid: cfdi.uuid, estado: estadoDeSat(cfdi.estadoSat), error: null } }));
  } catch (err) {
    if (err instanceof ErrorProcura) {
      await marcarError(d, factura.id, err.transitorio ? `${err.message} Puedes reintentar: si ya se timbró, se recupera sin duplicar.` : err.message);
      throw new ErrorFacturacion(err.message);
    }
    await marcarError(d, factura.id, "Ocurrió un error inesperado al facturar.");
    throw err;
  }
}

// ─── después de emitir ───────────────────────────────────────────────────────

async function cargar(d: Deps, id: string) {
  const f = await d.db((tx) => tx.facturaEmitida.findUnique({ where: { id } }));
  if (!f) throw new ErrorFacturacion("La factura no existe.");
  return f;
}

/** Consulta el estado del CFDI en Procura/SAT y lo refleja (útil sobre todo mientras una cancelación está en proceso). */
export async function refrescarFactura(d: Deps, id: string): Promise<FacturaEmitida> {
  const f = await cargar(d, id);
  if (!f.procuraCfdiId) throw new ErrorFacturacion("Esta factura aún no tiene comprobante.");
  try {
    const { estadoSat } = await d.api.refrescarEstado(f.procuraCfdiId);
    return await d.db((tx) => tx.facturaEmitida.update({ where: { id }, data: { estado: estadoDeSat(estadoSat) } }));
  } catch (e) {
    if (e instanceof ErrorProcura) throw new ErrorFacturacion(e.message);
    throw e;
  }
}

export type MotivoCancelacion = "01" | "02" | "03";
/** Solicita la cancelación ante el SAT. No es inmediata: queda «cancelando» hasta que el SAT confirma. */
export async function cancelarFactura(d: Deps, id: string, e: { motivo: MotivoCancelacion; uuidSustituto?: string }): Promise<FacturaEmitida> {
  const f = await cargar(d, id);
  if (f.estado !== "TIMBRADA" || !f.procuraCfdiId) throw new ErrorFacturacion("Solo se cancela una factura timbrada y vigente.");
  if (e.motivo === "01" && !e.uuidSustituto?.trim()) throw new ErrorFacturacion("Con el motivo 01 indica el folio fiscal (UUID) de la factura que la sustituye.");
  try {
    const { estadoSat } = await d.api.cancelar(f.procuraCfdiId, { motivo: e.motivo, uuidSustituto: e.uuidSustituto?.trim() || undefined }, `fn-cancelar-${f.id}-${e.motivo}`);
    return await d.db((tx) => tx.facturaEmitida.update({ where: { id }, data: { estado: estadoSat ? estadoDeSat(estadoSat) : "CANCELANDO" } }));
  } catch (err) {
    if (err instanceof ErrorProcura) throw new ErrorFacturacion(err.message);
    throw err;
  }
}

/** Enlaces firmados de corta vida para el XML y el PDF (se piden al momento; no se guardan). */
export async function descargasDeFactura(d: Deps, id: string) {
  const f = await cargar(d, id);
  if (!f.procuraCfdiId) throw new ErrorFacturacion("Esta factura aún no tiene comprobante.");
  try { const c = await d.api.obtenerCfdi(f.procuraCfdiId); return { xmlUrl: c.xmlUrl, pdfUrl: c.pdfUrl }; }
  catch (e) { if (e instanceof ErrorProcura) throw new ErrorFacturacion(e.message); throw e; }
}
