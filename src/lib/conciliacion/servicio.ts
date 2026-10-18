import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db/tenant";
import { aDate, aIso, esIso, hoyIso } from "@/lib/fechas";
import { registrarGasto, registrarIngreso } from "@/lib/finanzas/servicio";
import { saldoDe } from "@/lib/finanzas/moneda";
import { clavesDeLineas, mesDe, type LineaBanco } from "./importar";
import { MES_RE, explicarDiferencia, ultimoDiaDelMes } from "./cierre";
import { sugerir, type Candidato } from "./sugerir";

export class ErrorConciliacion extends Error {}

const huella = (cuentaId: string, clave: string) => createHash("sha256").update(`${cuentaId}|${clave}`).digest("hex").slice(0, 40);

/** Solo las cuentas con estado de cuenta del banco se concilian (el efectivo se cuadra con arqueo). */
async function cuentaConciliable(tx: Tx, cuentaId: string) {
  const c = await tx.cuenta.findUnique({ where: { id: cuentaId } });
  if (!c) throw new ErrorConciliacion("La cuenta no existe.");
  if (c.tipo === "EFECTIVO") throw new ErrorConciliacion("El efectivo no tiene estado de cuenta: se cuadra con el arqueo de caja.");
  return c;
}

const mesesCerrados = async (tx: Tx, cuentaId: string) =>
  new Set((await tx.cierreConciliacion.findMany({ where: { cuentaId }, select: { mes: true } })).map((c) => c.mes));

async function exigirMesAbierto(tx: Tx, cuentaId: string, fecha: string) {
  if (await tx.cierreConciliacion.findUnique({ where: { cuentaId_mes: { cuentaId, mes: mesDe(fecha) } } }))
    throw new ErrorConciliacion(`El mes ${mesDe(fecha)} ya está cerrado. Reábrelo para hacer cambios.`);
}

// ─── importación ─────────────────────────────────────────────────────────────

export async function importarLineas(
  tx: Tx, tenantId: string,
  e: { cuentaId: string; archivo: string; lineas: LineaBanco[]; mapeo?: Prisma.InputJsonValue; usuarioId?: string },
) {
  await cuentaConciliable(tx, e.cuentaId);
  if (e.lineas.length === 0) throw new ErrorConciliacion("El archivo no tiene movimientos.");
  if (e.lineas.length > 5000) throw new ErrorConciliacion("Máximo 5,000 movimientos por archivo.");
  for (const l of e.lineas) {
    if (!esIso(l.fecha) || !Number.isInteger(l.montoCentavos) || l.montoCentavos === 0 || Math.abs(l.montoCentavos) > 2_000_000_000) throw new ErrorConciliacion("El archivo tiene movimientos inválidos.");
  }
  const cerrados = await mesesCerrados(tx, e.cuentaId);
  // La clave se numera sobre TODO el archivo para que sea estable al volver a subirlo (o subir uno que se traslape)
  const claves = clavesDeLineas(e.lineas);
  const filas = e.lineas.map((l, i) => ({ l, huella: huella(e.cuentaId, claves[i]) }));
  const abiertas = filas.filter((f) => !cerrados.has(mesDe(f.l.fecha)));
  const imp = await tx.importacionBanco.create({
    data: { tenantId, cuentaId: e.cuentaId, archivo: e.archivo.slice(0, 200), filas: e.lineas.length, nuevas: 0, duplicadas: 0, fueraDePeriodo: filas.length - abiertas.length, creadoPorId: e.usuarioId },
  });
  const r = await tx.movimientoBanco.createMany({
    data: abiertas.map(({ l, huella }) => ({
      tenantId, cuentaId: e.cuentaId, fecha: aDate(l.fecha), descripcion: l.descripcion, montoCentavos: l.montoCentavos,
      saldoCentavos: l.saldoCentavos, referencia: l.referencia, huella, importacionId: imp.id,
    })),
    skipDuplicates: true,
  });
  await tx.importacionBanco.update({ where: { id: imp.id }, data: { nuevas: r.count, duplicadas: abiertas.length - r.count } });
  if (e.mapeo) await tx.cuenta.update({ where: { id: e.cuentaId }, data: { mapeoBanco: e.mapeo } });
  return { filas: e.lineas.length, nuevas: r.count, duplicadas: abiertas.length - r.count, fueraDePeriodo: filas.length - abiertas.length };
}

// ─── movimientos del sistema que aún no tienen pareja ────────────────────────

/** Gastos, ingresos y traspasos activos de la cuenta que ningún renglón del banco ha reclamado. Monto con signo. */
export async function candidatosDe(tx: Tx, cuentaId: string, desde: string, hasta: string): Promise<Candidato[]> {
  const fecha = { gte: aDate(desde), lte: aDate(hasta) };
  const gastos = await tx.gasto.findMany({ where: { cuentaId, estado: "ACTIVO", fecha, lineaBanco: null }, select: { id: true, fecha: true, concepto: true, proveedor: true, montoCentavos: true } });
  const ingresos = await tx.ingreso.findMany({ where: { cuentaId, estado: "ACTIVO", fecha, lineaBanco: null }, select: { id: true, fecha: true, concepto: true, montoCentavos: true } });
  const sale = await tx.traspaso.findMany({ where: { origenId: cuentaId, estado: "ACTIVO", fecha, lineasBanco: { none: { cuentaId } } }, include: { destino: { select: { nombre: true } } } });
  const entra = await tx.traspaso.findMany({ where: { destinoId: cuentaId, estado: "ACTIVO", fecha, lineasBanco: { none: { cuentaId } } }, include: { origen: { select: { nombre: true } } } });
  return [
    ...gastos.map((g): Candidato => ({ clave: `g:${g.id}`, fecha: aIso(g.fecha), montoCentavos: -g.montoCentavos, texto: [g.concepto, g.proveedor].filter(Boolean).join(" ") })),
    ...ingresos.map((i): Candidato => ({ clave: `i:${i.id}`, fecha: aIso(i.fecha), montoCentavos: i.montoCentavos, texto: i.concepto })),
    ...sale.map((t): Candidato => ({ clave: `t:${t.id}`, fecha: aIso(t.fecha), montoCentavos: -t.montoOrigenCentavos, texto: `Traspaso a ${t.destino.nombre}` })),
    ...entra.map((t): Candidato => ({ clave: `t:${t.id}`, fecha: aIso(t.fecha), montoCentavos: t.montoDestinoCentavos, texto: `Traspaso de ${t.origen.nombre}` })),
  ];
}

// ─── conciliar ───────────────────────────────────────────────────────────────

async function lineaPendiente(tx: Tx, lineaId: string) {
  const l = await tx.movimientoBanco.findUnique({ where: { id: lineaId } });
  if (!l) throw new ErrorConciliacion("El movimiento del banco no existe.");
  await exigirMesAbierto(tx, l.cuentaId, aIso(l.fecha));
  return l;
}

/** Empareja un renglón del banco con un movimiento del sistema ("g:", "i:" o "t:" + id). Exige el mismo importe exacto. */
export async function conciliar(tx: Tx, lineaId: string, clave: string, usuarioId?: string) {
  const l = await lineaPendiente(tx, lineaId);
  if (l.estado !== "PENDIENTE") throw new ErrorConciliacion("Este movimiento ya está conciliado o ignorado.");
  const [tipo, id] = clave.split(":");
  const datos: Prisma.MovimientoBancoUncheckedUpdateInput = { estado: "CONCILIADA", conciliadoPorId: usuarioId, conciliadoEn: new Date() };
  const mal = () => new ErrorConciliacion("El movimiento del sistema no coincide (cuenta, estado o importe).");
  if (tipo === "g") {
    const g = await tx.gasto.findUnique({ where: { id }, include: { lineaBanco: { select: { id: true } } } });
    if (!g || g.cuentaId !== l.cuentaId || g.estado !== "ACTIVO" || -g.montoCentavos !== l.montoCentavos) throw mal();
    if (g.lineaBanco) throw new ErrorConciliacion("Ese gasto ya está conciliado con otro movimiento del banco.");
    datos.gastoId = id;
  } else if (tipo === "i") {
    const i = await tx.ingreso.findUnique({ where: { id }, include: { lineaBanco: { select: { id: true } } } });
    if (!i || i.cuentaId !== l.cuentaId || i.estado !== "ACTIVO" || i.montoCentavos !== l.montoCentavos) throw mal();
    if (i.lineaBanco) throw new ErrorConciliacion("Ese ingreso ya está conciliado con otro movimiento del banco.");
    datos.ingresoId = id;
  } else if (tipo === "t") {
    const t = await tx.traspaso.findUnique({ where: { id } });
    if (!t || t.estado !== "ACTIVO") throw mal();
    const esperado = t.origenId === l.cuentaId ? -t.montoOrigenCentavos : t.destinoId === l.cuentaId ? t.montoDestinoCentavos : null;
    if (esperado === null || esperado !== l.montoCentavos) throw mal();
    if (await tx.movimientoBanco.findFirst({ where: { traspasoId: id, cuentaId: l.cuentaId }, select: { id: true } })) throw new ErrorConciliacion("Ese traspaso ya está conciliado en esta cuenta.");
    datos.traspasoId = id;
  } else throw mal();
  return tx.movimientoBanco.update({ where: { id: lineaId }, data: datos });
}

export async function desconciliar(tx: Tx, lineaId: string) {
  const l = await lineaPendiente(tx, lineaId);
  if (l.estado !== "CONCILIADA") throw new ErrorConciliacion("Este movimiento no está conciliado.");
  return tx.movimientoBanco.update({ where: { id: lineaId }, data: { estado: "PENDIENTE", gastoId: null, ingresoId: null, traspasoId: null, conciliadoPorId: null, conciliadoEn: null } });
}

/** "Sin pareja": el renglón es real pero no corresponde a nada del sistema. Sigue contando como diferencia explicada. */
export async function ignorar(tx: Tx, lineaId: string, usuarioId?: string) {
  const l = await lineaPendiente(tx, lineaId);
  if (l.estado !== "PENDIENTE") throw new ErrorConciliacion("Este movimiento ya está conciliado o ignorado.");
  return tx.movimientoBanco.update({ where: { id: lineaId }, data: { estado: "IGNORADA", conciliadoPorId: usuarioId, conciliadoEn: new Date() } });
}

export async function restaurar(tx: Tx, lineaId: string) {
  const l = await lineaPendiente(tx, lineaId);
  if (l.estado !== "IGNORADA") throw new ErrorConciliacion("Este movimiento no está ignorado.");
  return tx.movimientoBanco.update({ where: { id: lineaId }, data: { estado: "PENDIENTE", conciliadoPorId: null, conciliadoEn: null } });
}

/** Crea el gasto (si salió dinero) o el ingreso (si entró) que le falta al sistema y lo deja conciliado. */
export async function crearDesdeLinea(tx: Tx, tenantId: string, lineaId: string, o: { categoriaId?: string | null; usuarioId?: string } = {}) {
  const l = await lineaPendiente(tx, lineaId);
  if (l.estado !== "PENDIENTE") throw new ErrorConciliacion("Este movimiento ya está conciliado o ignorado.");
  const base = { concepto: l.descripcion.length >= 2 ? l.descripcion : `${l.descripcion} (banco)`, cuentaId: l.cuentaId, fecha: aIso(l.fecha), montoCentavos: Math.abs(l.montoCentavos), categoriaId: o.categoriaId || null, notas: "Creado desde la conciliación bancaria", usuarioId: o.usuarioId };
  const clave = l.montoCentavos < 0 ? `g:${(await registrarGasto(tx, tenantId, base)).id}` : `i:${(await registrarIngreso(tx, tenantId, base)).id}`;
  await conciliar(tx, lineaId, clave, o.usuarioId);
  return clave;
}

// ─── datos de la pantalla de conciliación ────────────────────────────────────

const VENTANA_OPCIONES = 10, VENTANA_PRESELECCION = 3;

export async function pendientesConSugerencias(tx: Tx, cuentaId: string, limite = 100) {
  const lineas = await tx.movimientoBanco.findMany({ where: { cuentaId, estado: "PENDIENTE" }, orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }], take: limite });
  const total = await tx.movimientoBanco.count({ where: { cuentaId, estado: "PENDIENTE" } });
  if (lineas.length === 0) return { lineas: [], total, candidatos: [] as Candidato[], sugerencias: new Map<string, ReturnType<typeof sugerir> extends Map<string, infer S> ? S : never>() };
  const aplanadas = lineas.map((l) => ({ id: l.id, fecha: aIso(l.fecha), montoCentavos: l.montoCentavos, descripcion: l.descripcion }));
  const desde = new Date(aDate(aplanadas[0].fecha).getTime() - VENTANA_OPCIONES * 86_400_000), hasta = new Date(aDate(aplanadas[aplanadas.length - 1].fecha).getTime() + VENTANA_OPCIONES * 86_400_000);
  const candidatos = await candidatosDe(tx, cuentaId, aIso(desde), aIso(hasta));
  const sugerencias = sugerir(aplanadas, candidatos, VENTANA_OPCIONES);
  // Solo se preselecciona lo cercano en fecha; las demás opciones quedan a elección de la persona
  for (const s of sugerencias.values()) {
    const e = s.opciones.find((o) => o.clave === s.elegida);
    if (e && e.dias > VENTANA_PRESELECCION) { s.elegida = null; s.segura = false; }
  }
  return { lineas, total, candidatos, sugerencias };
}

// ─── saldos y cierre mensual ─────────────────────────────────────────────────

const sum = (v: { _sum?: object }, campo: string) => ((v._sum as Record<string, number | null> | undefined)?.[campo]) ?? 0;

/** Saldo de la cuenta en el sistema al final de un día. */
export async function saldoAl(tx: Tx, cuentaId: string, fechaIso: string) {
  const c = await cuentaConciliable(tx, cuentaId);
  const lte = aDate(fechaIso);
  const ing = sum(await tx.ingreso.aggregate({ where: { cuentaId, estado: "ACTIVO", fecha: { lte } }, _sum: { montoCentavos: true } }), "montoCentavos");
  const gas = sum(await tx.gasto.aggregate({ where: { cuentaId, estado: "ACTIVO", fecha: { lte } }, _sum: { montoCentavos: true } }), "montoCentavos");
  const tOut = sum(await tx.traspaso.aggregate({ where: { origenId: cuentaId, estado: "ACTIVO", fecha: { lte } }, _sum: { montoOrigenCentavos: true } }), "montoOrigenCentavos");
  const tIn = sum(await tx.traspaso.aggregate({ where: { destinoId: cuentaId, estado: "ACTIVO", fecha: { lte } }, _sum: { montoDestinoCentavos: true } }), "montoDestinoCentavos");
  const aju = sum(await tx.ajusteCuenta.aggregate({ where: { cuentaId, fecha: { lte } }, _sum: { montoCentavos: true } }), "montoCentavos");
  return saldoDe({ saldoInicial: c.saldoInicialCentavos, ingresos: ing, gastos: gas, traspasosEntrada: tIn, traspasosSalida: tOut, ajustes: aju });
}

/** Todo lo que cuenta en el cuadre de un mes: el banco, el sistema y lo que falta por un lado u otro. */
export async function cuadreDelMes(tx: Tx, cuentaId: string, mes: string, saldoBancoCentavos: number) {
  if (!MES_RE.test(mes)) throw new ErrorConciliacion("Mes inválido.");
  const fin = ultimoDiaDelMes(mes);
  const saldoSistemaCentavos = await saldoAl(tx, cuentaId, fin);
  const soloBanco = await tx.movimientoBanco.findMany({ where: { cuentaId, estado: { in: ["PENDIENTE", "IGNORADA"] }, fecha: { lte: aDate(fin) } }, orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }] });
  const soloSistema = (await candidatosDe(tx, cuentaId, "1900-01-01", fin)).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const pendientes = soloBanco.filter((l) => l.estado === "PENDIENTE").length;
  const r = explicarDiferencia({
    saldoBancoCentavos, saldoSistemaCentavos,
    pendientesBancoCentavos: soloBanco.reduce((n, l) => n + l.montoCentavos, 0),
    sinConciliarSistemaCentavos: soloSistema.reduce((n, c) => n + c.montoCentavos, 0),
  });
  return { mes, fin, saldoBancoCentavos, saldoSistemaCentavos, ...r, soloBanco, soloSistema, pendientes };
}

/** Saldo que reporta el banco al cierre del mes, si el archivo traía la columna de saldo. */
export async function saldoSugeridoDelBanco(tx: Tx, cuentaId: string, mes: string): Promise<number | null> {
  const ultima = await tx.movimientoBanco.findFirst({
    where: { cuentaId, saldoCentavos: { not: null }, fecha: { lte: aDate(ultimoDiaDelMes(mes)) } },
    orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }],
  });
  // Dentro de un mismo día el orden del archivo no se conserva: solo se sugiere si el mes tiene movimientos con saldo
  return ultima && mesDe(aIso(ultima.fecha)) === mes ? ultima.saldoCentavos : null;
}

export async function cerrarMes(tx: Tx, tenantId: string, e: { cuentaId: string; mes: string; saldoBancoCentavos: number; notas?: string; usuarioId?: string }) {
  await cuentaConciliable(tx, e.cuentaId);
  if (!MES_RE.test(e.mes)) throw new ErrorConciliacion("Mes inválido.");
  if (!Number.isInteger(e.saldoBancoCentavos)) throw new ErrorConciliacion("Saldo del banco inválido.");
  if (ultimoDiaDelMes(e.mes) >= hoyIso()) throw new ErrorConciliacion("Ese mes aún no termina.");
  if (await tx.cierreConciliacion.findUnique({ where: { cuentaId_mes: { cuentaId: e.cuentaId, mes: e.mes } } })) throw new ErrorConciliacion("Ese mes ya está cerrado.");
  const c = await cuadreDelMes(tx, e.cuentaId, e.mes, e.saldoBancoCentavos);
  if (c.pendientes > 0) throw new ErrorConciliacion(`Hay ${c.pendientes} movimiento${c.pendientes === 1 ? "" : "s"} del banco sin conciliar o ignorar.`);
  if (c.sinExplicar !== 0 && (e.notas?.trim().length ?? 0) < 3) throw new ErrorConciliacion("El cuadre tiene una diferencia sin explicar: anota el motivo para cerrar el mes.");
  return tx.cierreConciliacion.create({
    data: { tenantId, cuentaId: e.cuentaId, mes: e.mes, saldoBancoCentavos: e.saldoBancoCentavos, saldoSistemaCentavos: c.saldoSistemaCentavos, sinExplicarCentavos: c.sinExplicar, notas: e.notas?.trim() || null, cerradoPorId: e.usuarioId },
  });
}

/** Solo se reabre el cierre más reciente: así los meses anteriores no quedan con huecos. */
export async function reabrirMes(tx: Tx, cuentaId: string, mes: string) {
  const ultimo = await tx.cierreConciliacion.findFirst({ where: { cuentaId }, orderBy: { mes: "desc" } });
  if (!ultimo || ultimo.mes !== mes) throw new ErrorConciliacion("Solo se puede reabrir el cierre más reciente de la cuenta.");
  await tx.cierreConciliacion.delete({ where: { id: ultimo.id } });
}
