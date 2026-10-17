import type { RolUsuario } from "@prisma/client";

export type Permiso =
  | "flota:escribir"
  | "reservas:escribir"
  | "reservas:cobrar"
  | "usuarios:administrar";

const MATRIZ: Record<RolUsuario, Permiso[]> = {
  ADMIN: ["flota:escribir", "reservas:escribir", "reservas:cobrar", "usuarios:administrar"],
  GERENTE: ["flota:escribir", "reservas:escribir", "reservas:cobrar"],
  VENDEDOR: ["reservas:escribir", "reservas:cobrar"],
  OPERACIONES: ["flota:escribir"],
};

export function puede(rol: RolUsuario, permiso: Permiso): boolean {
  return MATRIZ[rol].includes(permiso);
}
