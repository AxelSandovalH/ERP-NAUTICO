import type { Reporte } from "./servicio";

const celda = (v: string | number) => {
  const t = String(v);
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const pesos = (c: number) => (c / 100).toFixed(2);

/** Reporte completo en CSV (con BOM para Excel): resumen mensual, por categoría, por canal y por embarcación. */
export function csvDeReporte(r: Reporte, empresa: string, moneda: string): string {
  const filas: (string | number)[][] = [["Reporte", empresa, r.periodo.etiqueta, `${r.periodo.desde} a ${r.periodo.hasta}`, moneda], []];
  if (r.finanzas) {
    filas.push(["Resumen por mes", "Ingresos", "Gastos", "Utilidad"]);
    r.periodo.meses.forEach((m, i) => filas.push([m, pesos(r.finanzas!.ingresos[i]), pesos(r.finanzas!.gastos[i]), pesos(r.finanzas!.ingresos[i] - r.finanzas!.gastos[i])]));
    filas.push(["Total", pesos(r.finanzas.totalIngresos), pesos(r.finanzas.totalGastos), pesos(r.finanzas.utilidad)], []);
    filas.push(["Gastos por categoría", "Importe"], ...r.finanzas.gastosPorCategoria.map((p) => [p.etiqueta, pesos(p.centavos)]), []);
    filas.push(["Ingresos por categoría", "Importe"], ...r.finanzas.ingresosPorCategoria.map((p) => [p.etiqueta, pesos(p.centavos)]), []);
  }
  if (r.ventas) {
    filas.push(["Ventas por mes (reservas no canceladas)", "Ventas"]);
    r.periodo.meses.forEach((m, i) => filas.push([m, pesos(r.ventas!.porMes[i])]));
    filas.push(["Reservas", r.ventas.reservas], ["Ventas", pesos(r.ventas.ventas)], ["Ticket promedio", pesos(r.ventas.ticketPromedio)], ["Por cobrar", pesos(r.ventas.porCobrar)], []);
    filas.push(["Ventas por canal", "Importe"], ...r.ventas.porOrigen.map((p) => [p.etiqueta, pesos(p.centavos)]), []);
    filas.push(["Embarcación", "Reservas", "Ventas", "Gastos", "Resultado"], ...r.ventas.porEmbarcacion.map((e) => [e.nombre, e.reservas, pesos(e.ventas), pesos(e.gastos), pesos(e.resultado)]));
  }
  return "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n";
}
