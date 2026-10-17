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
  | "usuarios:administrar";

const MATRIZ: Record<RolUsuario, Permiso[]> = {
  ADMIN: ["flota:escribir", "reservas:escribir", "reservas:cobrar", "tripulacion:escribir", "tripulacion:asignar", "comisiones:ver_propias", "comisiones:administrar", "nomina:administrar", "asistencia:checar", "asistencia:administrar", "usuarios:administrar"],
  GERENTE: ["flota:escribir", "reservas:escribir", "reservas:cobrar", "tripulacion:escribir", "tripulacion:asignar", "comisiones:ver_propias", "comisiones:administrar", "nomina:administrar", "asistencia:checar", "asistencia:administrar"],
  VENDEDOR: ["reservas:escribir", "reservas:cobrar", "comisiones:ver_propias", "asistencia:checar"],
  OPERACIONES: ["flota:escribir", "tripulacion:escribir", "tripulacion:asignar", "asistencia:checar", "asistencia:administrar"],
};

export function puede(rol: RolUsuario, permiso: Permiso): boolean {
  return MATRIZ[rol].includes(permiso);
}
