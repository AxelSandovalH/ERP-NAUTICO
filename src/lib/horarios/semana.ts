// Semanas y turnos (puro, sin BD). La semana empieza el lunes y se identifica por su fecha.
import { aDate, esIso, sumarDias } from "@/lib/fechas";

export const esLunes = (iso: string) => esIso(iso) && aDate(iso).getUTCDay() === 1;

/** Lunes de la semana a la que pertenece una fecha. */
export function lunesDe(iso: string): string {
  const dow = aDate(iso).getUTCDay(); // 0 = domingo
  return sumarDias(iso, -((dow + 6) % 7));
}

export const diasDeSemana = (lunes: string): string[] => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));

export const NOMBRES_DIA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;

export const TIPOS_AUSENCIA = { DESCANSO: "Descanso", VACACIONES: "Vacaciones", INCAPACIDAD: "Incapacidad", PERMISO: "Permiso" } as const;
export type TipoAusencia = keyof typeof TIPOS_AUSENCIA;
export const esAusencia = (t: string): t is TipoAusencia => t in TIPOS_AUSENCIA;

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Un turno con fin <= inicio cruza la medianoche. */
export const cruzaMedianoche = (inicioMin: number, finMin: number) => finMin <= inicioMin;
export const duracionMin = (inicioMin: number, finMin: number) => (cruzaMedianoche(inicioMin, finMin) ? finMin + 1440 - inicioMin : finMin - inicioMin);
export const rangoTexto = (inicioMin: number, finMin: number) => `${hhmm(inicioMin)}–${hhmm(finMin)}${cruzaMedianoche(inicioMin, finMin) ? " (+1)" : ""}`;

/** Horas legibles: 480 → "8 h", 450 → "7.5 h". */
export const horasTexto = (min: number) => `${(min / 60).toLocaleString("es-MX", { maximumFractionDigits: 1 })} h`;

/** Valida los datos de una plantilla de turno; devuelve el mensaje de error o null. */
export function errorDePlantilla(nombre: string, inicioMin: number, finMin: number): string | null {
  if (nombre.trim().length < 2) return "Escribe el nombre del turno.";
  if (![inicioMin, finMin].every((m) => Number.isInteger(m) && m >= 0 && m < 1440)) return "El horario es inválido.";
  if (inicioMin === finMin) return "La hora de entrada y la de salida no pueden ser la misma.";
  return null;
}

/** "HH:MM" a minutos desde medianoche, o null. */
export function horaAMinutos(texto: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export type TurnoMin = { tipo: string; inicioMin: number | null; finMin: number | null };
/** Minutos trabajados en una lista de asignaciones (solo cuentan los turnos, no los descansos ni ausencias). */
export const minutosTrabajados = (turnos: TurnoMin[]) => turnos.reduce((s, t) => s + (t.tipo === "TURNO" && t.inicioMin !== null && t.finMin !== null ? duracionMin(t.inicioMin, t.finMin) : 0), 0);
