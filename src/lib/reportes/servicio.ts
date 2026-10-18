import type { Tx } from "@/lib/db/tenant";
import { aDate, aIso } from "@/lib/fechas";
import { ORIGENES } from "@/lib/etiquetas";
import { agruparPor, sumarPorMes, topConOtras, type Parte } from "./agregar";
import type { Periodo } from "./rangos";

export type Finanzas = {
  ingresos: number[]; gastos: number[];
  totalIngresos: number; totalGastos: number; utilidad: number;
  previos: { ingresos: number; gastos: number };
  gastosPorCategoria: Parte[]; ingresosPorCategoria: Parte[];
};
export type FilaEmbarcacion = { id: string; nombre: string; reservas: number; ventas: number; gastos: number; resultado: number };
export type Ventas = {
  reservas: number; ventas: number; ticketPromedio: number;
  previos: { reservas: number; ventas: number };
  porCobrar: number;
  porMes: number[];
  porOrigen: Parte[]; porEmbarcacion: FilaEmbarcacion[];
};
export type Reporte = { periodo: Periodo; finanzas: Finanzas | null; ventas: Ventas | null };

const suma = (v: number[]) => v.reduce((a, b) => a + b, 0);

/** Datos de los reportes para un periodo y el anterior equivalente. Consultas en serie (una transacción, un cliente de pg). */
export async function reporteDe(tx: Tx, periodo: Periodo, modulos: { finanzas: boolean; reservas: boolean }): Promise<Reporte> {
  const rango = { gte: aDate(periodo.anteriorDesde), lte: aDate(periodo.hasta) };
  const enActual = (fecha: string) => fecha >= periodo.desde;
  // Entre el fin del periodo anterior y el inicio del actual puede haber días sin comparar: no cuentan para nadie
  const enAnterior = (fecha: string) => fecha >= periodo.anteriorDesde && fecha <= periodo.anteriorHasta;
  let finanzas: Finanzas | null = null, ventas: Ventas | null = null;
  const embarcaciones = new Map((await tx.embarcacion.findMany({ select: { id: true, nombre: true } })).map((e) => [e.id, e.nombre]));
  let gastosRows: { fecha: string; montoCentavos: number; embarcacionId: string | null; categoria: string }[] = [];

  if (modulos.finanzas) {
    const ing = (await tx.ingreso.findMany({ where: { estado: "ACTIVO", fecha: rango }, select: { fecha: true, montoBaseCentavos: true, categoria: { select: { nombre: true } } } }))
      .map((i) => ({ fecha: aIso(i.fecha), montoCentavos: i.montoBaseCentavos, categoria: i.categoria?.nombre ?? "Sin categoría" }));
    gastosRows = (await tx.gasto.findMany({ where: { estado: "ACTIVO", fecha: rango }, select: { fecha: true, montoBaseCentavos: true, embarcacionId: true, categoria: { select: { nombre: true } } } }))
      .map((g) => ({ fecha: aIso(g.fecha), montoCentavos: g.montoBaseCentavos, embarcacionId: g.embarcacionId, categoria: g.categoria?.nombre ?? "Sin categoría" }));
    const ingA = ing.filter((i) => enActual(i.fecha)), gasA = gastosRows.filter((g) => enActual(g.fecha));
    const ingresos = sumarPorMes(ingA, periodo.meses), gastos = sumarPorMes(gasA, periodo.meses);
    finanzas = {
      ingresos, gastos, totalIngresos: suma(ingresos), totalGastos: suma(gastos), utilidad: suma(ingresos) - suma(gastos),
      previos: { ingresos: suma(ing.filter((i) => enAnterior(i.fecha)).map((i) => i.montoCentavos)), gastos: suma(gastosRows.filter((g) => enAnterior(g.fecha)).map((g) => g.montoCentavos)) },
      gastosPorCategoria: topConOtras(agruparPor(gasA, (g) => g.categoria, (k) => k), 7),
      ingresosPorCategoria: topConOtras(agruparPor(ingA, (i) => i.categoria, (k) => k), 7),
    };
  }

  if (modulos.reservas) {
    // Las ventas se miden por la fecha de la salida y cubren el mes completo (con las reservas que aún no pasan), como el panel
    const rs = (await tx.reserva.findMany({
      where: { estado: { not: "CANCELADA" }, fecha: { gte: aDate(periodo.anteriorDesde), lte: aDate(periodo.hastaMes) } },
      select: { fecha: true, totalCentavos: true, origen: true, embarcacionId: true, pagos: { select: { montoCentavos: true } } },
    })).map((r) => ({ ...r, fecha: aIso(r.fecha) }));
    const actuales = rs.filter((r) => enActual(r.fecha)), previas = rs.filter((r) => r.fecha >= periodo.anteriorDesde && r.fecha <= periodo.anteriorHastaMes);
    const total = suma(actuales.map((r) => r.totalCentavos));
    const porEmb = new Map<string, FilaEmbarcacion>();
    for (const r of actuales) {
      const f = porEmb.get(r.embarcacionId) ?? { id: r.embarcacionId, nombre: embarcaciones.get(r.embarcacionId) ?? "—", reservas: 0, ventas: 0, gastos: 0, resultado: 0 };
      f.reservas++; f.ventas += r.totalCentavos;
      porEmb.set(r.embarcacionId, f);
    }
    for (const g of gastosRows) if (enActual(g.fecha) && g.embarcacionId) {
      const f = porEmb.get(g.embarcacionId) ?? { id: g.embarcacionId, nombre: embarcaciones.get(g.embarcacionId) ?? "—", reservas: 0, ventas: 0, gastos: 0, resultado: 0 };
      f.gastos += g.montoCentavos;
      porEmb.set(g.embarcacionId, f);
    }
    ventas = {
      reservas: actuales.length, ventas: total, ticketPromedio: actuales.length ? Math.round(total / actuales.length) : 0,
      previos: { reservas: previas.length, ventas: suma(previas.map((r) => r.totalCentavos)) },
      porCobrar: actuales.reduce((s, r) => s + Math.max(0, r.totalCentavos - suma(r.pagos.map((p) => p.montoCentavos))), 0),
      porMes: sumarPorMes(actuales.map((r) => ({ fecha: r.fecha, montoCentavos: r.totalCentavos })), periodo.meses),
      porOrigen: topConOtras(agruparPor(actuales.map((r) => ({ origen: r.origen, montoCentavos: r.totalCentavos })), (r) => r.origen, (k) => ORIGENES[k as keyof typeof ORIGENES] ?? k), 7),
      porEmbarcacion: [...porEmb.values()].map((f) => ({ ...f, resultado: f.ventas - f.gastos })).sort((a, b) => b.ventas - a.ventas || a.nombre.localeCompare(b.nombre)),
    };
  }
  return { periodo, finanzas, ventas };
}
