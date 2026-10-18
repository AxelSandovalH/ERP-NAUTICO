import type { Tx } from "@/lib/db/tenant";
import { aDate, aIso, esIso, sumarDias } from "@/lib/fechas";
import { diasDeSemana, errorDePlantilla, esAusencia, esLunes, TIPOS_AUSENCIA } from "./semana";

export class ErrorHorarios extends Error {}

// ─── plantillas de turno ─────────────────────────────────────────────────────

export async function guardarPlantilla(
  tx: Tx, tenantId: string, id: string | null,
  e: { nombre: string; inicioMin: number; finMin: number; color: string; activa?: boolean },
) {
  const err = errorDePlantilla(e.nombre, e.inicioMin, e.finMin);
  if (err) throw new ErrorHorarios(err);
  if (!/^#[0-9a-fA-F]{6}$/.test(e.color)) throw new ErrorHorarios("Color inválido.");
  const nombre = e.nombre.trim();
  const repetido = await tx.plantillaTurno.findFirst({ where: { nombre, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (repetido) throw new ErrorHorarios("Ya tienes un turno con ese nombre.");
  const datos = { nombre, inicioMin: e.inicioMin, finMin: e.finMin, color: e.color };
  if (id) {
    if (!(await tx.plantillaTurno.findUnique({ where: { id }, select: { id: true } }))) throw new ErrorHorarios("El turno no existe.");
    return tx.plantillaTurno.update({ where: { id }, data: { ...datos, ...(e.activa === undefined ? {} : { activa: e.activa }) } });
  }
  return tx.plantillaTurno.create({ data: { tenantId, ...datos } });
}

// ─── personas ────────────────────────────────────────────────────────────────

/** Da de alta a una persona del equipo. Es el mismo catálogo que usan Nómina y Asistencia (sueldo en cero hasta que se capture). */
export async function crearPersona(tx: Tx, tenantId: string, e: { nombre: string; apellido?: string; puesto?: string; usuarioId?: string | null }) {
  if (e.nombre.trim().length < 2) throw new ErrorHorarios("Escribe el nombre.");
  if (e.usuarioId) await exigirUsuarioLibre(tx, tenantId, e.usuarioId);
  return tx.empleado.create({ data: { tenantId, nombre: e.nombre.trim(), apellido: e.apellido?.trim() ?? "", puesto: e.puesto?.trim() || null, usuarioId: e.usuarioId || null, sueldoCentavos: 0 } });
}

/** El usuario debe ser de la misma empresa y no estar ya vinculado a otra persona. */
async function exigirUsuarioLibre(tx: Tx, tenantId: string, usuarioId: string, excepto?: string) {
  // Usuario no tiene RLS por empresa (es de identidad): la pertenencia se comprueba aquí
  const u = await tx.usuario.findUnique({ where: { id: usuarioId }, select: { tenantId: true } });
  if (!u || u.tenantId !== tenantId) throw new ErrorHorarios("El usuario no existe.");
  const otro = await tx.empleado.findFirst({ where: { usuarioId, ...(excepto ? { id: { not: excepto } } : {}) }, select: { nombre: true } });
  if (otro) throw new ErrorHorarios(`Ese usuario ya está vinculado a ${otro.nombre}.`);
}

export async function vincularUsuario(tx: Tx, tenantId: string, empleadoId: string, usuarioId: string | null) {
  if (!(await tx.empleado.findUnique({ where: { id: empleadoId }, select: { id: true } }))) throw new ErrorHorarios("La persona no existe.");
  if (usuarioId) await exigirUsuarioLibre(tx, tenantId, usuarioId, empleadoId);
  return tx.empleado.update({ where: { id: empleadoId }, data: { usuarioId } });
}

// ─── asignaciones ────────────────────────────────────────────────────────────

/** `valor`: "" (vaciar), "p:<id de plantilla>" o un tipo de ausencia (DESCANSO, VACACIONES, INCAPACIDAD, PERMISO). */
export async function asignar(tx: Tx, tenantId: string, e: { empleadoId: string; fecha: string; valor: string; usuarioId?: string }) {
  if (!esIso(e.fecha)) throw new ErrorHorarios("Fecha inválida.");
  const emp = await tx.empleado.findUnique({ where: { id: e.empleadoId }, select: { id: true, activo: true } });
  if (!emp) throw new ErrorHorarios("La persona no existe.");
  const donde = { empleadoId_fecha: { empleadoId: e.empleadoId, fecha: aDate(e.fecha) } };
  if (e.valor === "") { await tx.turnoEmpleado.deleteMany({ where: { empleadoId: e.empleadoId, fecha: aDate(e.fecha) } }); return null; }
  if (!emp.activo) throw new ErrorHorarios("Esa persona está inactiva.");
  let datos: { tipo: "TURNO" | keyof typeof TIPOS_AUSENCIA; plantillaId: string | null; etiqueta: string | null; inicioMin: number | null; finMin: number | null; color: string | null };
  if (e.valor.startsWith("p:")) {
    const p = await tx.plantillaTurno.findUnique({ where: { id: e.valor.slice(2) } });
    if (!p || !p.activa) throw new ErrorHorarios("El turno no existe o está inactivo.");
    datos = { tipo: "TURNO", plantillaId: p.id, etiqueta: p.nombre, inicioMin: p.inicioMin, finMin: p.finMin, color: p.color };
  } else if (esAusencia(e.valor)) {
    datos = { tipo: e.valor, plantillaId: null, etiqueta: TIPOS_AUSENCIA[e.valor], inicioMin: null, finMin: null, color: null };
  } else throw new ErrorHorarios("Opción inválida.");
  return tx.turnoEmpleado.upsert({
    where: donde,
    create: { tenantId, empleadoId: e.empleadoId, fecha: aDate(e.fecha), ...datos, asignadoPorId: e.usuarioId },
    update: { ...datos, asignadoPorId: e.usuarioId },
  });
}

/** Copia a la semana `aLunes` lo planeado en `desdeLunes`, sin pisar lo que ya esté asignado. Solo personas activas. */
export async function copiarSemana(tx: Tx, tenantId: string, desdeLunes: string, aLunes: string, usuarioId?: string) {
  if (!esLunes(desdeLunes) || !esLunes(aLunes)) throw new ErrorHorarios("Las semanas deben empezar en lunes.");
  if (desdeLunes === aLunes) throw new ErrorHorarios("Elige una semana distinta.");
  const origen = await tx.turnoEmpleado.findMany({ where: { fecha: { gte: aDate(desdeLunes), lte: aDate(sumarDias(desdeLunes, 6)) }, empleado: { activo: true } } });
  const destino = await tx.turnoEmpleado.findMany({ where: { fecha: { gte: aDate(aLunes), lte: aDate(sumarDias(aLunes, 6)) } }, select: { empleadoId: true, fecha: true } });
  const ocupado = new Set(destino.map((d) => `${d.empleadoId}|${aIso(d.fecha)}`));
  const dias = diasDeSemana(desdeLunes);
  const nuevos = origen.flatMap((t) => {
    const nueva = sumarDias(aLunes, dias.indexOf(aIso(t.fecha)));
    if (ocupado.has(`${t.empleadoId}|${nueva}`)) return [];
    return [{ tenantId, empleadoId: t.empleadoId, fecha: aDate(nueva), tipo: t.tipo, plantillaId: t.plantillaId, etiqueta: t.etiqueta, inicioMin: t.inicioMin, finMin: t.finMin, color: t.color, asignadoPorId: usuarioId }];
  });
  if (nuevos.length) await tx.turnoEmpleado.createMany({ data: nuevos });
  return { copiados: nuevos.length, omitidos: origen.length - nuevos.length };
}

// ─── publicar ────────────────────────────────────────────────────────────────

export async function publicarSemana(tx: Tx, tenantId: string, lunes: string, publicar: boolean, usuarioId?: string) {
  if (!esLunes(lunes)) throw new ErrorHorarios("La semana debe empezar en lunes.");
  if (!publicar) { await tx.semanaPublicada.deleteMany({ where: { semana: aDate(lunes) } }); return; }
  await tx.semanaPublicada.upsert({
    where: { tenantId_semana: { tenantId, semana: aDate(lunes) } },
    create: { tenantId, semana: aDate(lunes), publicadaPorId: usuarioId },
    update: { publicadaPorId: usuarioId, publicadaEn: new Date() },
  });
}

// ─── consultas ───────────────────────────────────────────────────────────────

/** Lo planeado en una semana: personas activas, sus asignaciones y si está publicada. */
export async function semanaDe(tx: Tx, tenantId: string, lunes: string) {
  const rango = { gte: aDate(lunes), lte: aDate(sumarDias(lunes, 6)) };
  const personas = await tx.empleado.findMany({ where: { activo: true }, orderBy: [{ nombre: "asc" }, { apellido: "asc" }], select: { id: true, nombre: true, apellido: true, puesto: true } });
  const turnos = await tx.turnoEmpleado.findMany({ where: { fecha: rango, empleado: { activo: true } } });
  const publicada = await tx.semanaPublicada.findUnique({ where: { tenantId_semana: { tenantId, semana: aDate(lunes) } } });
  return { personas, turnos, publicada };
}

/** El horario de una persona, solo de las semanas publicadas, desde `desdeLunes` durante `semanas` semanas. */
export async function miHorario(tx: Tx, empleadoId: string, desdeLunes: string, semanas: number) {
  const lunes = Array.from({ length: semanas }, (_, i) => sumarDias(desdeLunes, i * 7));
  const publicadas = new Set((await tx.semanaPublicada.findMany({ where: { semana: { in: lunes.map(aDate) } }, select: { semana: true } })).map((s) => aIso(s.semana)));
  const turnos = await tx.turnoEmpleado.findMany({ where: { empleadoId, fecha: { gte: aDate(desdeLunes), lte: aDate(sumarDias(desdeLunes, semanas * 7 - 1)) } } });
  return lunes.map((l) => ({
    lunes: l, publicada: publicadas.has(l),
    dias: diasDeSemana(l).map((dia) => ({ dia, turno: publicadas.has(l) ? (turnos.find((t) => aIso(t.fecha) === dia) ?? null) : null })),
  }));
}
