import type { Tx } from "@/lib/db/tenant";
import { aDate, aIso } from "@/lib/fechas";
import { ORIGENES_MOVIMIENTO } from "@/lib/etiquetas";
import { agruparPor, sumarPorMes, topConOtras, type Parte } from "./agregar";
import type { Periodo } from "./rangos";

const rango = (p: Periodo) => ({ gte: aDate(p.desde), lte: aDate(p.hasta) });

export type Movimiento = { id: string; fecha: string; concepto: string; detalle: string; centavos: number };

/** Gastos del periodo: por embarcación y los más grandes. */
export async function gastosDetalle(tx: Tx, p: Periodo): Promise<{ porEmbarcacion: Parte[]; mayores: Movimiento[]; cantidad: number }> {
  const rows = await tx.gasto.findMany({
    where: { estado: "ACTIVO", fecha: rango(p) },
    select: { id: true, fecha: true, concepto: true, proveedor: true, montoBaseCentavos: true, categoria: { select: { nombre: true } }, embarcacion: { select: { nombre: true } } },
    orderBy: { montoBaseCentavos: "desc" },
  });
  const filas = rows.map((r) => ({ montoCentavos: r.montoBaseCentavos, emb: r.embarcacion?.nombre ?? "Sin embarcación" }));
  return {
    cantidad: rows.length,
    porEmbarcacion: topConOtras(agruparPor(filas, (f) => f.emb, (k) => k), 7),
    mayores: rows.slice(0, 10).map((r) => ({ id: r.id, fecha: aIso(r.fecha), concepto: r.concepto, detalle: [r.categoria?.nombre, r.proveedor].filter(Boolean).join(" · "), centavos: r.montoBaseCentavos })),
  };
}

/** Ingresos del periodo: por origen, por cuenta y los más grandes. */
export async function ingresosDetalle(tx: Tx, p: Periodo): Promise<{ porOrigen: Parte[]; porCuenta: Parte[]; mayores: Movimiento[]; cantidad: number }> {
  const rows = await tx.ingreso.findMany({
    where: { estado: "ACTIVO", fecha: rango(p) },
    select: { id: true, fecha: true, concepto: true, montoBaseCentavos: true, origen: true, cuenta: { select: { nombre: true } }, categoria: { select: { nombre: true } } },
    orderBy: { montoBaseCentavos: "desc" },
  });
  const filas = rows.map((r) => ({ montoCentavos: r.montoBaseCentavos, origen: r.origen as string, cuenta: r.cuenta.nombre }));
  return {
    cantidad: rows.length,
    porOrigen: topConOtras(agruparPor(filas, (f) => f.origen, (k) => ORIGENES_MOVIMIENTO[k as keyof typeof ORIGENES_MOVIMIENTO] ?? k), 7),
    porCuenta: topConOtras(agruparPor(filas, (f) => f.cuenta, (k) => k), 7),
    mayores: rows.slice(0, 10).map((r) => ({ id: r.id, fecha: aIso(r.fecha), concepto: r.concepto, detalle: [r.categoria?.nombre, r.cuenta.nombre].filter(Boolean).join(" · "), centavos: r.montoBaseCentavos })),
  };
}

export type FilaRecurso = { clave: string; nombre: string; traslados: number; pax: number; ventas: number; gastos: number };
export type ReporteTransporte = {
  traslados: number; pax: number; ventas: number; cobrado: number; gastos: number; resultado: number;
  previos: { traslados: number; ventas: number };
  porMes: number[]; porUnidad: FilaRecurso[]; porChofer: FilaRecurso[];
};

/** Flota terrestre: traslados no cancelados del periodo (hasta el fin del mes, como las ventas), con su precio y los gastos ligados. */
export async function reporteTransporte(tx: Tx, p: Periodo): Promise<ReporteTransporte> {
  const ts = await tx.traslado.findMany({
    where: { estado: { not: "CANCELADO" }, fecha: { gte: aDate(p.desde), lte: aDate(p.hastaMes) } },
    select: { id: true, fecha: true, pax: true, precioCentavos: true, ingresoId: true, unidad: { select: { id: true, nombre: true } }, chofer: { select: { id: true, nombre: true, apellido: true } } },
  });
  const gastos = ts.length ? await tx.gasto.findMany({ where: { estado: "ACTIVO", trasladoId: { in: ts.map((t) => t.id) } }, select: { trasladoId: true, montoBaseCentavos: true } }) : [];
  const gastoDe = new Map<string, number>();
  for (const g of gastos) if (g.trasladoId) gastoDe.set(g.trasladoId, (gastoDe.get(g.trasladoId) ?? 0) + g.montoBaseCentavos);
  const agrupar = (clave: (t: (typeof ts)[number]) => [string, string]) => {
    const por = new Map<string, FilaRecurso>();
    for (const t of ts) {
      const [k, nombre] = clave(t);
      const f = por.get(k) ?? { clave: k, nombre, traslados: 0, pax: 0, ventas: 0, gastos: 0 };
      f.traslados++; f.pax += t.pax; f.ventas += t.precioCentavos; f.gastos += gastoDe.get(t.id) ?? 0;
      por.set(k, f);
    }
    return [...por.values()].sort((a, b) => b.ventas - a.ventas || b.traslados - a.traslados || a.nombre.localeCompare(b.nombre));
  };
  const previos = await tx.traslado.aggregate({ where: { estado: { not: "CANCELADO" }, fecha: { gte: aDate(p.anteriorDesde), lte: aDate(p.anteriorHastaMes) } }, _count: true, _sum: { precioCentavos: true } });
  const ventas = ts.reduce((s, t) => s + t.precioCentavos, 0), gasto = [...gastoDe.values()].reduce((s, v) => s + v, 0);
  return {
    traslados: ts.length, pax: ts.reduce((s, t) => s + t.pax, 0), ventas, cobrado: ts.filter((t) => t.ingresoId).reduce((s, t) => s + t.precioCentavos, 0), gastos: gasto, resultado: ventas - gasto,
    previos: { traslados: previos._count, ventas: previos._sum.precioCentavos ?? 0 },
    porMes: sumarPorMes(ts.map((t) => ({ fecha: aIso(t.fecha), montoCentavos: t.precioCentavos })), p.meses),
    porUnidad: agrupar((t) => [t.unidad?.id ?? "sin", t.unidad?.nombre ?? "Sin unidad"]),
    porChofer: agrupar((t) => [t.chofer?.id ?? "sin", t.chofer ? `${t.chofer.nombre} ${t.chofer.apellido}`.trim() : "Sin chofer"]),
  };
}
