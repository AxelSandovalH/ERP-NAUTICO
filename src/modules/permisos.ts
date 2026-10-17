import type { RolUsuario } from "@prisma/client";

export type Permiso =
  | "flota:escribir"
  | "reservas:escribir"
  | "reservas:cobrar"
  | "tripulacion:escribir"
  | "tripulacion:asignar"
  | "comisiones:ver_propias"
  | "comisiones:administrar"
  | "usuarios:administrar";

const MATRIZ: Record<RolUsuario, Permiso[]> = {
  ADMIN: ["flota:escribir", "reservas:escribir", "reservas:cobrar", "tripulacion:escribir", "tripulacion:asignar", "comisiones:ver_propias", "comisiones:administrar", "usuarios:administrar"],
  GERENTE: ["flota:escribir", "reservas:escribir", "reservas:cobrar", "tripulacion:escribir", "tripulacion:asignar", "comisiones:ver_propias", "comisiones:administrar"],
  VENDEDOR: ["reservas:escribir", "reservas:cobrar", "comisiones:ver_propias"],
  OPERACIONES: ["flota:escribir", "tripulacion:escribir", "tripulacion:asignar"],
};

export function puede(rol: RolUsuario, permiso: Permiso): boolean {
  return MATRIZ[rol].includes(permiso);
}
