import type { RolUsuario } from "@prisma/client";

export type Permiso =
  | "flota:escribir"
  | "reservas:escribir"
  | "reservas:cobrar"
  | "tripulacion:escribir"
  | "tripulacion:asignar"
  | "comisiones:ver_propias"
  | "comisiones:administrar"
  | "nomina:administrar"
  | "asistencia:checar"
  | "asistencia:administrar"
  | "gastos:registrar"
  | "gastos:administrar"
  | "ingresos:ver"
  | "ingresos:administrar"
  | "cuentas:administrar"
  | "conciliacion:administrar"
  | "reportes:ver"
  | "horarios:administrar"
  | "horarios:ver_propio"
  | "usuarios:administrar";

const MATRIZ: Record<RolUsuario, Permiso[]> = {
  ADMIN: ["flota:escribir", "reservas:escribir", "reservas:cobrar", "tripulacion:escribir", "tripulacion:asignar", "comisiones:ver_propias", "comisiones:administrar", "nomina:administrar", "asistencia:checar", "asistencia:administrar", "gastos:registrar", "gastos:administrar", "ingresos:ver", "ingresos:administrar", "cuentas:administrar", "conciliacion:administrar", "reportes:ver", "horarios:administrar", "horarios:ver_propio", "usuarios:administrar"],
  GERENTE: ["flota:escribir", "reservas:escribir", "reservas:cobrar", "tripulacion:escribir", "tripulacion:asignar", "comisiones:ver_propias", "comisiones:administrar", "nomina:administrar", "asistencia:checar", "asistencia:administrar", "gastos:registrar", "gastos:administrar", "ingresos:ver", "ingresos:administrar", "cuentas:administrar", "conciliacion:administrar", "reportes:ver", "horarios:administrar", "horarios:ver_propio"],
  VENDEDOR: ["reservas:escribir", "reservas:cobrar", "comisiones:ver_propias", "asistencia:checar", "horarios:ver_propio"],
  OPERACIONES: ["flota:escribir", "tripulacion:escribir", "tripulacion:asignar", "asistencia:checar", "asistencia:administrar", "gastos:registrar", "horarios:administrar", "horarios:ver_propio"],
};

export function puede(rol: RolUsuario, permiso: Permiso): boolean {
  return MATRIZ[rol].includes(permiso);
}
