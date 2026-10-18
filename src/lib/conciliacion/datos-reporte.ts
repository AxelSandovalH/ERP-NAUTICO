import type { Tx } from "@/lib/db/tenant";
import { aIso } from "@/lib/fechas";
import { MES_RE } from "./cierre";
import { cuadreDelMes } from "./servicio";

/** Datos del reporte de un mes: usa el saldo del cierre si el mes está cerrado; si no, el que se indique. */
export async function datosDeReporte(tx: Tx, cuentaId: string, mes: string, saldoTexto?: string) {
  if (!MES_RE.test(mes)) return null;
  const cuenta = await tx.cuenta.findUnique({ where: { id: cuentaId } });
  if (!cuenta || cuenta.tipo === "EFECTIVO") return null;
  const cierre = await tx.cierreConciliacion.findUnique({ where: { cuentaId_mes: { cuentaId, mes } } });
  let saldoBanco = cierre?.saldoBancoCentavos ?? null;
  if (saldoBanco === null && saldoTexto && /^-?\d+(\.\d{1,2})?$/.test(saldoTexto.trim())) saldoBanco = Math.round(Number(saldoTexto) * 100);
  if (saldoBanco === null) return { cuenta, cierre, cuadre: null };
  const cuadre = await cuadreDelMes(tx, cuentaId, mes, saldoBanco);
  return {
    cuenta, cierre, cuadre,
    soloBanco: cuadre.soloBanco.map((l) => ({ fecha: aIso(l.fecha), descripcion: l.descripcion, montoCentavos: l.montoCentavos, estado: l.estado === "IGNORADA" ? "Sin pareja" : "Por conciliar" })),
  };
}
