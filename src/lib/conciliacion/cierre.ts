// Cuadre de un mes (puro): ¿la diferencia entre el banco y el sistema está explicada por lo que falta conciliar?

export type EntradaCierre = {
  /** Saldo final del estado de cuenta del banco */
  saldoBancoCentavos: number;
  /** Saldo de la cuenta en el sistema al último día del mes */
  saldoSistemaCentavos: number;
  /** Suma con signo de las líneas del banco sin conciliar (están en el banco, no en el sistema) */
  pendientesBancoCentavos: number;
  /** Suma con signo de los movimientos del sistema sin conciliar (están en el sistema, no en el banco) */
  sinConciliarSistemaCentavos: number;
};

/** Si todo lo demás está conciliado: banco − sistema = (lo que solo está en el banco) − (lo que solo está en el sistema). */
export function explicarDiferencia(e: EntradaCierre) {
  const diferencia = e.saldoBancoCentavos - e.saldoSistemaCentavos;
  const explicada = e.pendientesBancoCentavos - e.sinConciliarSistemaCentavos;
  return { diferencia, explicada, sinExplicar: diferencia - explicada };
}

export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Último día del mes (YYYY-MM → YYYY-MM-DD). */
export function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
