import type { Tx } from "@/lib/db/tenant";
import { aDate, aIso } from "@/lib/fechas";
import { motivoIncompatible, type CfdiRecibido, type GastoPendiente } from "./recibidas";

export class ErrorRecibidas extends Error {}

/** Gastos activos que requieren factura y todavía no tienen una ligada (los más recientes primero). */
export async function gastosPendientesDeFactura(tx: Tx, limite = 300): Promise<GastoPendiente[]> {
  const gastos = await tx.gasto.findMany({ where: { estado: "ACTIVO", requiereFactura: true, cfdi: null }, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: limite, select: { id: true, fecha: true, montoCentavos: true, moneda: true, concepto: true, proveedor: true } });
  return gastos.map((g) => ({ id: g.id, fecha: aIso(g.fecha), montoCentavos: g.montoCentavos, moneda: g.moneda, texto: [g.concepto, g.proveedor].filter(Boolean).join(" ") }));
}

/** UUID de las facturas que ya respaldan algún gasto de la empresa (para no volver a ofrecerlas). */
export async function uuidsLigados(tx: Tx): Promise<Set<string>> {
  return new Set((await tx.gastoCfdi.findMany({ select: { uuid: true } })).map((x) => x.uuid));
}

/** Liga una factura recibida a un gasto. Los datos de la factura deben venir de Procura (no del navegador). */
export async function ligarFactura(tx: Tx, tenantId: string, e: { gastoId: string; cfdi: CfdiRecibido; usuarioId?: string }) {
  const g = await tx.gasto.findUnique({ where: { id: e.gastoId }, include: { cfdi: { select: { id: true } } } });
  if (!g) throw new ErrorRecibidas("El gasto no existe.");
  if (g.estado !== "ACTIVO") throw new ErrorRecibidas("El gasto está cancelado.");
  if (g.cfdi) throw new ErrorRecibidas("Ese gasto ya tiene una factura ligada.");
  const motivo = motivoIncompatible({ montoCentavos: g.montoCentavos, moneda: g.moneda }, e.cfdi);
  if (motivo) throw new ErrorRecibidas(motivo);
  if (await tx.gastoCfdi.findFirst({ where: { uuid: e.cfdi.uuid }, select: { id: true } })) throw new ErrorRecibidas("Esa factura ya respalda otro gasto.");
  return tx.gastoCfdi.create({
    data: {
      tenantId, gastoId: g.id, procuraCfdiId: e.cfdi.id, uuid: e.cfdi.uuid, rfcEmisor: e.cfdi.rfcEmisor, nombreEmisor: e.cfdi.nombreEmisor,
      totalCentavos: e.cfdi.totalCentavos, moneda: e.cfdi.moneda, emitidoEn: aDate(e.cfdi.emitidoEn), ligadoPorId: e.usuarioId,
    },
  });
}

export async function desligarFactura(tx: Tx, gastoId: string) {
  const r = await tx.gastoCfdi.deleteMany({ where: { gastoId } });
  if (r.count === 0) throw new ErrorRecibidas("Ese gasto no tiene una factura ligada.");
}
