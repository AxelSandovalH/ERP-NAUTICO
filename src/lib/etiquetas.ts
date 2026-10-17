export const TIPOS_EMBARCACION = {
  YATE: "Yate", CATAMARAN: "Catamarán", VELERO: "Velero",
  LANCHA: "Lancha", MOTO_ACUATICA: "Moto acuática", PANGA: "Panga",
} as const;

export const ESTADOS_EMBARCACION = { ACTIVA: "Activa", MANTENIMIENTO: "Mantenimiento", INACTIVA: "Inactiva" } as const;

export const ESTADOS_RESERVA = {
  PENDIENTE: "Pendiente", CONFIRMADA: "Confirmada", COMPLETADA: "Completada", CANCELADA: "Cancelada",
} as const;

export const TONO_RESERVA = { PENDIENTE: "ambar", CONFIRMADA: "azul", COMPLETADA: "verde", CANCELADA: "rojo" } as const;

export const ORIGENES = { DIRECTO: "Directo", WEB: "Web", AGENCIA: "Agencia", CONCIERGE: "Concierge" } as const;
export const METODOS_PAGO = { EFECTIVO: "Efectivo", TARJETA: "Tarjeta", TRANSFERENCIA: "Transferencia", OTRO: "Otro" } as const;
export const ROLES = { ADMIN: "Administrador", GERENTE: "Gerente", VENDEDOR: "Vendedor", OPERACIONES: "Operaciones" } as const;
