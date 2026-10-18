// Reporte de diferencias en CSV (puro). Con BOM para que Excel respete los acentos.
const celda = (v: string | number) => {
  const t = String(v);
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const pesos = (centavos: number) => (centavos / 100).toFixed(2);

export type EntradaReporte = {
  cuenta: string; moneda: string; mes: string;
  saldoBancoCentavos: number; saldoSistemaCentavos: number; diferencia: number; explicada: number; sinExplicar: number;
  soloBanco: { fecha: string; descripcion: string; montoCentavos: number; estado: string }[];
  soloSistema: { fecha: string; texto: string; montoCentavos: number }[];
};

export function csvDeReporte(r: EntradaReporte): string {
  const filas: (string | number)[][] = [
    ["Conciliación bancaria", r.cuenta, r.mes, r.moneda], [],
    ["Saldo del banco", pesos(r.saldoBancoCentavos)], ["Saldo en el sistema", pesos(r.saldoSistemaCentavos)],
    ["Diferencia (banco − sistema)", pesos(r.diferencia)], ["Explicada por lo no conciliado", pesos(r.explicada)], ["Sin explicar", pesos(r.sinExplicar)], [],
    ["Sección", "Fecha", "Descripción", "Importe", "Estado"],
    ...r.soloBanco.map((l) => ["Solo en el banco", l.fecha, l.descripcion, pesos(l.montoCentavos), l.estado]),
    ...r.soloSistema.map((c) => ["Solo en el sistema", c.fecha, c.texto, pesos(c.montoCentavos), ""]),
  ];
  return "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n";
}
