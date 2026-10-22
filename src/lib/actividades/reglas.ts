// Reglas puras de las actividades (sin BD) para poder probarlas. Horarios en minutos desde medianoche;
// fechas "YYYY-MM-DD" del negocio; dinero en centavos.
import { esIso } from "@/lib/fechas";
import { rangoValido } from "@/lib/reservas/disponibilidad";

export const MAX_PAX_RESERVA = 500;

export type DatosActividad = { nombre: string; duracionMin: number; precioCentavos: number; cupo: number };

/** null = válido; si no, el motivo en español. */
export function errorDeActividad(a: DatosActividad): string | null {
  if (a.nombre.trim().length < 2) return "Escribe el nombre de la actividad.";
  if (!Number.isInteger(a.duracionMin) || a.duracionMin < 15 || a.duracionMin > 24 * 60) return "La duración debe ser de 15 minutos a 24 horas.";
  if (!Number.isInteger(a.precioCentavos) || a.precioCentavos < 0) return "El precio por persona no es válido.";
  if (!Number.isInteger(a.cupo) || a.cupo < 1 || a.cupo > 500) return "El cupo debe ser de 1 a 500 lugares.";
  return null;
}

export const finDeSalida = (inicioMin: number, duracionMin: number) => inicioMin + duracionMin;

export type DatosSalida = { fecha: string; inicioMin: number; finMin: number; cupo: number; precioCentavos: number };

export function errorDeSalida(s: DatosSalida): string | null {
  if (!esIso(s.fecha)) return "Fecha inválida.";
  if (!rangoValido({ inicioMin: s.inicioMin, finMin: s.finMin })) return "El horario es inválido: la salida debe terminar el mismo día, después de que empieza.";
  if (!Number.isInteger(s.cupo) || s.cupo < 1 || s.cupo > 500) return "El cupo debe ser de 1 a 500 lugares.";
  if (!Number.isInteger(s.precioCentavos) || s.precioCentavos < 0) return "El precio por persona no es válido.";
  return null;
}

type ConPax = { pax: number; estado: string };

/** Lugares ya apartados: las reservas canceladas liberan su lugar. */
export const lugaresOcupados = (reservas: ConPax[]) => reservas.filter((r) => r.estado !== "CANCELADA").reduce((a, r) => a + r.pax, 0);
export const lugaresLibres = (cupo: number, reservas: ConPax[]) => Math.max(0, cupo - lugaresOcupados(reservas));

/** null = se puede reservar; si no, el motivo. `libres` son los lugares que quedan SIN contar esta reserva. */
export function errorDeReserva(pax: number, libres: number, estadoSalida: string): string | null {
  if (estadoSalida !== "PROGRAMADA") return estadoSalida === "CANCELADA" ? "La salida está cancelada." : "La salida ya se realizó.";
  if (!Number.isInteger(pax) || pax < 1) return "Indica al menos 1 persona.";
  if (pax > MAX_PAX_RESERVA) return "Demasiadas personas en una sola reserva.";
  if (pax > libres) return libres === 0 ? "La salida está llena." : `Solo quedan ${libres} ${libres === 1 ? "lugar" : "lugares"}.`;
  return null;
}

export const totalDeReserva = (pax: number, precioUnitarioCentavos: number) => pax * precioUnitarioCentavos;

export type EstadoCobro = "LIQUIDADA" | "PARCIAL" | "SIN_PAGO";
export function cobro(totalCentavos: number, pagadoCentavos: number): EstadoCobro {
  if (totalCentavos <= 0 || pagadoCentavos >= totalCentavos) return "LIQUIDADA";
  return pagadoCentavos > 0 ? "PARCIAL" : "SIN_PAGO";
}
export const saldo = (totalCentavos: number, pagadoCentavos: number) => Math.max(0, totalCentavos - pagadoCentavos);

/** null = el pago cabe en el saldo de la reserva. */
export function errorDePago(montoCentavos: number, totalCentavos: number, pagadoCentavos: number): string | null {
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) return "El monto debe ser mayor a cero.";
  if (montoCentavos > saldo(totalCentavos, pagadoCentavos)) return "El pago es mayor al saldo de la reserva.";
  return null;
}
