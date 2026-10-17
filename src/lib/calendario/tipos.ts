export type Cobro = "LIQUIDADA" | "PARCIAL" | "SIN_PAGO";

export type PropReserva = {
  tipo: "reserva";
  reservaId: string;
  folio: number;
  estado: "PENDIENTE" | "CONFIRMADA" | "COMPLETADA" | "CANCELADA";
  embarcacion: string;
  embarcacionId: string;
  cliente: string;
  telefono: string | null;
  email: string | null;
  personas: number;
  origen: string;
  vendedor: string | null;
  /** Iniciales del vendedor o, si no hay, abreviatura del origen */
  vendedorAbrev: string;
  cobro: Cobro;
  totalCentavos: number;
  pagadoCentavos: number;
  horaInicio: string; // HH:MM
  horaFin: string;
  notas: string | null;
  capitan: string | null;
  /** Reserva sin ningún anticipo: se pinta con rayas */
  sinAnticipo: boolean;
  textoOscuro: boolean;
};

export type PropBloqueo = {
  tipo: "bloqueo";
  bloqueoId: string;
  embarcacion: string;
  embarcacionId: string;
  motivo: string;
  desde: string; // YYYY-MM-DD
  hasta: string;
  textoOscuro: boolean;
};

export type EventoCal = {
  id: string;
  title: string;
  start: string; // "YYYY-MM-DDTHH:MM:00" local del negocio, o "YYYY-MM-DD" si allDay
  end: string;
  allDay?: boolean;
  backgroundColor: string;
  borderColor: string;
  extendedProps: PropReserva | PropBloqueo;
};

export type BarcoFlota = { id: string; nombre: string; color: string };
