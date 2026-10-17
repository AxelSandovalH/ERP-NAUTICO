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
export const ROLES_TRIPULANTE = { CAPITAN: "Capitán", MARINERO: "Marinero", GUIA: "Guía", COCINERO: "Cocinero", FOTOGRAFO: "Fotógrafo", OTRO: "Otro" } as const;
export const TIPOS_BENEFICIARIO = { VENDEDOR: "Vendedor", AGENCIA: "Agencia", CONCIERGE: "Concierge", OTRO: "Otro" } as const;
export const TIPOS_TARIFA = { FIJO: "Monto fijo", PORCENTAJE: "% del total", PORCENTAJE_BALANCE: "% del balance (venta − precio casa)", SIN: "Sin comisión" } as const;
export const ESTADOS_COMISION = { PENDIENTE: "Pendiente", PAGADA: "Pagada", CANCELADA: "Cancelada" } as const;
