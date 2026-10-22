import type { MetodoPago, TipoCuenta } from "@prisma/client";
import type { Tx } from "@/lib/db/tenant";
import { aDate, aIso, diaLocal, esIso } from "@/lib/fechas";
import { CATEGORIAS_BASE, CLAVES } from "./categorias-base";
import { armarMovimiento, diferenciaArqueo, esMoneda, saldoDe, type Moneda } from "./moneda";

export class ErrorFinanzas extends Error {}

// ─── contexto de la empresa ──────────────────────────────────────────────────

async function contexto(tx: Tx, tenantId: string) {
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { moneda: true, zonaHoraria: true } });
  const base: Moneda = t && esMoneda(t.moneda) ? t.moneda : "MXN";
  const cfg = await obtenerConfig(tx, tenantId);
  return { base, zona: t?.zonaHoraria ?? "America/Mazatlan", cfg };
}

export async function obtenerConfig(tx: Tx, tenantId: string) {
  const c = await tx.configFinanzas.findUnique({ where: { tenantId } });
  return c ?? tx.configFinanzas.create({ data: { tenantId } });
}

/** Crea las categorías iniciales si la empresa aún no tiene ninguna (idempotente). */
export async function asegurarCategoriasBase(tx: Tx, tenantId: string) {
  if ((await tx.categoria.count()) > 0) return;
  await tx.categoria.createMany({ data: CATEGORIAS_BASE.map((c, i) => ({ tenantId, tipo: c.tipo, nombre: c.nombre, clave: c.clave ?? null, orden: i })), skipDuplicates: true });
}

/** Categoría de sistema (NOMINA, COMISIONES, RESERVAS); la crea si faltara. */
async function categoriaPorClave(tx: Tx, tenantId: string, clave: keyof typeof CLAVES) {
  const hallada = await tx.categoria.findFirst({ where: { clave } });
  if (hallada) return hallada;
  const base = CATEGORIAS_BASE.find((c) => c.clave === clave)!;
  return tx.categoria.create({ data: { tenantId, tipo: base.tipo, nombre: base.nombre, clave, orden: 0 } }).catch(async () =>
    // el nombre ya existía sin clave (la renombraron o la crearon a mano): se le asigna la clave
    tx.categoria.update({ where: { tenantId_tipo_nombre: { tenantId, tipo: base.tipo, nombre: base.nombre } }, data: { clave } }));
}

async function cuentaActiva(tx: Tx, cuentaId: string) {
  const c = await tx.cuenta.findUnique({ where: { id: cuentaId } });
  if (!c) throw new ErrorFinanzas("La cuenta no existe.");
  if (!c.activa) throw new ErrorFinanzas(`La cuenta ${c.nombre} está inactiva.`);
  return c;
}

/** Un movimiento ya conciliado con el banco no se cancela: primero hay que desconciliarlo. */
async function exigirNoConciliado(tx: Tx, donde: { gastoId: string } | { ingresoId: string } | { traspasoId: string }) {
  if (await tx.movimientoBanco.findFirst({ where: { ...donde, estado: "CONCILIADA" }, select: { id: true } }))
    throw new ErrorFinanzas("Este movimiento ya está conciliado con el banco. Desconcílialo primero en Conciliación bancaria.");
}

const validarMonto = (m: number) => { if (!Number.isInteger(m) || m <= 0) throw new ErrorFinanzas("El monto debe ser mayor a cero."); };
const validarFecha = (f: string) => { if (!esIso(f)) throw new ErrorFinanzas("Fecha inválida."); };

// ─── gastos ──────────────────────────────────────────────────────────────────

export type EntradaGasto = {
  concepto: string; cuentaId: string; fecha: string; montoCentavos: number; tipoCambio?: number | null;
  categoriaId?: string | null; embarcacionId?: string | null; reservaId?: string | null; trasladoId?: string | null; proveedor?: string; notas?: string;
  requiereFactura?: boolean; usuarioId?: string;
};

export async function registrarGasto(tx: Tx, tenantId: string, e: EntradaGasto) {
  if (e.concepto.trim().length < 2) throw new ErrorFinanzas("Escribe el concepto.");
  validarMonto(e.montoCentavos); validarFecha(e.fecha);
  const cuenta = await cuentaActiva(tx, e.cuentaId);
  if (e.categoriaId && !(await tx.categoria.findFirst({ where: { id: e.categoriaId, tipo: "GASTO", activa: true } }))) throw new ErrorFinanzas("La categoría no existe o está inactiva.");
  if (e.embarcacionId && !(await tx.embarcacion.findUnique({ where: { id: e.embarcacionId }, select: { id: true } }))) throw new ErrorFinanzas("La embarcación no existe.");
  if (e.reservaId && !(await tx.reserva.findUnique({ where: { id: e.reservaId }, select: { id: true } }))) throw new ErrorFinanzas("La reserva no existe.");
  if (e.trasladoId && !(await tx.traslado.findUnique({ where: { id: e.trasladoId }, select: { id: true } }))) throw new ErrorFinanzas("El traslado no existe.");
  const { base, cfg } = await contexto(tx, tenantId);
  const m = armarMovimiento(cuenta.moneda, base, cfg.tipoCambio, { montoCentavos: e.montoCentavos, tipoCambio: e.tipoCambio });
  return tx.gasto.create({
    data: {
      tenantId, concepto: e.concepto.trim(), cuentaId: cuenta.id, ...m, fecha: aDate(e.fecha), categoriaId: e.categoriaId || null,
      embarcacionId: e.embarcacionId || null, reservaId: e.reservaId || null, trasladoId: e.trasladoId || null, proveedor: e.proveedor?.trim() || null, notas: e.notas?.trim() || null,
      requiereFactura: e.requiereFactura ?? false, registradoPorId: e.usuarioId,
    },
  });
}

export async function cancelarGasto(tx: Tx, id: string, usuarioId: string, motivo: string) {
  const g = await tx.gasto.findUnique({ where: { id } });
  if (!g) throw new ErrorFinanzas("El gasto no existe.");
  if (g.estado === "CANCELADO") throw new ErrorFinanzas("El gasto ya está cancelado.");
  if (g.origen !== "MANUAL")
    throw new ErrorFinanzas(g.origen === "NOMINA" ? "Este gasto lo generó un pago de nómina: cancela el pago de nómina."
      : g.origen === "INVENTARIO" ? "Este gasto lo generó una compra de inventario: anula la compra en Inventario."
      : "Este gasto lo generó un abono de comisiones: anula el abono.");
  if (motivo.trim().length < 3) throw new ErrorFinanzas("Indica el motivo de la cancelación.");
  await exigirNoConciliado(tx, { gastoId: id });
  return tx.gasto.update({ where: { id }, data: { estado: "CANCELADO", canceladoPorId: usuarioId, canceladoEn: new Date(), motivoCancelacion: motivo.trim() } });
}

// ─── ingresos ────────────────────────────────────────────────────────────────

export type EntradaIngreso = {
  concepto: string; cuentaId: string; fecha: string; montoCentavos: number; tipoCambio?: number | null;
  categoriaId?: string | null; reservaId?: string | null; notas?: string; usuarioId?: string;
};

export async function registrarIngreso(tx: Tx, tenantId: string, e: EntradaIngreso) {
  if (e.concepto.trim().length < 2) throw new ErrorFinanzas("Escribe el concepto.");
  validarMonto(e.montoCentavos); validarFecha(e.fecha);
  const cuenta = await cuentaActiva(tx, e.cuentaId);
  if (e.categoriaId && !(await tx.categoria.findFirst({ where: { id: e.categoriaId, tipo: "INGRESO", activa: true } }))) throw new ErrorFinanzas("La categoría no existe o está inactiva.");
  if (e.reservaId && !(await tx.reserva.findUnique({ where: { id: e.reservaId }, select: { id: true } }))) throw new ErrorFinanzas("La reserva no existe.");
  const { base, cfg } = await contexto(tx, tenantId);
  const m = armarMovimiento(cuenta.moneda, base, cfg.tipoCambio, { montoCentavos: e.montoCentavos, tipoCambio: e.tipoCambio });
  return tx.ingreso.create({
    data: { tenantId, concepto: e.concepto.trim(), cuentaId: cuenta.id, ...m, fecha: aDate(e.fecha), categoriaId: e.categoriaId || null, reservaId: e.reservaId || null, notas: e.notas?.trim() || null, registradoPorId: e.usuarioId },
  });
}

export async function cancelarIngreso(tx: Tx, id: string, usuarioId: string, motivo: string) {
  const i = await tx.ingreso.findUnique({ where: { id } });
  if (!i) throw new ErrorFinanzas("El ingreso no existe.");
  if (i.estado === "CANCELADO") throw new ErrorFinanzas("El ingreso ya está cancelado.");
  if (i.origen === "PAGO_RESERVA") throw new ErrorFinanzas("Este ingreso lo generó el pago de una reserva: elimina el pago en la reserva.");
  if (i.origen === "TRANSPORTE") throw new ErrorFinanzas("Este ingreso lo generó el cobro de un traslado: anula el cobro en Transporte.");
  if (i.origen === "ACTIVIDAD") throw new ErrorFinanzas("Este ingreso lo generó el pago de una actividad: elimina el pago en la reserva de la actividad.");
  if (motivo.trim().length < 3) throw new ErrorFinanzas("Indica el motivo de la cancelación.");
  await exigirNoConciliado(tx, { ingresoId: id });
  return tx.ingreso.update({ where: { id }, data: { estado: "CANCELADO", canceladoPorId: usuarioId, canceladoEn: new Date(), motivoCancelacion: motivo.trim() } });
}

export async function confirmarIngreso(tx: Tx, id: string, usuarioId: string, confirmado: boolean) {
  const i = await tx.ingreso.findUnique({ where: { id } });
  if (!i) throw new ErrorFinanzas("El ingreso no existe.");
  if (i.estado === "CANCELADO") throw new ErrorFinanzas("El ingreso está cancelado.");
  return tx.ingreso.update({ where: { id }, data: confirmado ? { confirmado: true, confirmadoPorId: usuarioId, confirmadoEn: new Date() } : { confirmado: false, confirmadoPorId: null, confirmadoEn: null } });
}

// ─── traspasos ───────────────────────────────────────────────────────────────

export async function crearTraspaso(
  tx: Tx, tenantId: string,
  e: { origenId: string; destinoId: string; montoOrigenCentavos: number; montoDestinoCentavos?: number | null; fecha: string; notas?: string; usuarioId?: string },
) {
  if (e.origenId === e.destinoId) throw new ErrorFinanzas("El origen y el destino deben ser cuentas distintas.");
  validarMonto(e.montoOrigenCentavos); validarFecha(e.fecha);
  const origen = await cuentaActiva(tx, e.origenId), destino = await cuentaActiva(tx, e.destinoId);
  let montoDestino = e.montoOrigenCentavos, tipoCambio: number | null = null;
  if (origen.moneda !== destino.moneda) {
    // Al cambiar de moneda se necesita saber cuánto llegó: se captura el monto recibido (lo real del banco)
    if (!e.montoDestinoCentavos) throw new ErrorFinanzas(`Las cuentas están en monedas distintas (${origen.moneda} → ${destino.moneda}): indica cuánto se recibió.`);
    validarMonto(e.montoDestinoCentavos);
    montoDestino = e.montoDestinoCentavos;
    const usd = origen.moneda === "USD" ? e.montoOrigenCentavos : montoDestino, mxn = origen.moneda === "MXN" ? e.montoOrigenCentavos : montoDestino;
    tipoCambio = Math.round((mxn / usd) * 10_000) / 10_000;
  } else if (e.montoDestinoCentavos && e.montoDestinoCentavos !== e.montoOrigenCentavos) {
    throw new ErrorFinanzas("En la misma moneda el monto recibido debe ser igual al enviado.");
  }
  return tx.traspaso.create({
    data: { tenantId, origenId: origen.id, destinoId: destino.id, montoOrigenCentavos: e.montoOrigenCentavos, montoDestinoCentavos: montoDestino, tipoCambio, fecha: aDate(e.fecha), notas: e.notas?.trim() || null, registradoPorId: e.usuarioId },
  });
}

export async function cancelarTraspaso(tx: Tx, id: string) {
  const t = await tx.traspaso.findUnique({ where: { id } });
  if (!t) throw new ErrorFinanzas("El traspaso no existe.");
  if (t.estado === "CANCELADO") throw new ErrorFinanzas("El traspaso ya está cancelado.");
  await exigirNoConciliado(tx, { traspasoId: id });
  return tx.traspaso.update({ where: { id }, data: { estado: "CANCELADO" } });
}

// ─── saldos y arqueo ─────────────────────────────────────────────────────────

const suma = <T extends { _sum: Record<string, number | null> }>(filas: T[], clave: (f: T) => string, campo: string) =>
  new Map(filas.map((f) => [clave(f), f._sum[campo] ?? 0]));

/** Saldo de cada cuenta de la empresa. Consultas en serie: una transacción usa un solo cliente de pg. */
export async function saldosPorCuenta(tx: Tx) {
  const cuentas = await tx.cuenta.findMany({ orderBy: [{ activa: "desc" }, { nombre: "asc" }] });
  const ing = suma(await tx.ingreso.groupBy({ by: ["cuentaId"], where: { estado: "ACTIVO" }, _sum: { montoCentavos: true } }), (f) => f.cuentaId, "montoCentavos");
  const gas = suma(await tx.gasto.groupBy({ by: ["cuentaId"], where: { estado: "ACTIVO" }, _sum: { montoCentavos: true } }), (f) => f.cuentaId, "montoCentavos");
  const tOut = suma(await tx.traspaso.groupBy({ by: ["origenId"], where: { estado: "ACTIVO" }, _sum: { montoOrigenCentavos: true } }), (f) => f.origenId, "montoOrigenCentavos");
  const tIn = suma(await tx.traspaso.groupBy({ by: ["destinoId"], where: { estado: "ACTIVO" }, _sum: { montoDestinoCentavos: true } }), (f) => f.destinoId, "montoDestinoCentavos");
  const aju = suma(await tx.ajusteCuenta.groupBy({ by: ["cuentaId"], _sum: { montoCentavos: true } }), (f) => f.cuentaId, "montoCentavos");
  return cuentas.map((c) => ({
    cuenta: c,
    saldoCentavos: saldoDe({
      saldoInicial: c.saldoInicialCentavos, ingresos: ing.get(c.id) ?? 0, gastos: gas.get(c.id) ?? 0,
      traspasosEntrada: tIn.get(c.id) ?? 0, traspasosSalida: tOut.get(c.id) ?? 0, ajustes: aju.get(c.id) ?? 0,
    }),
  }));
}

export async function saldoCuenta(tx: Tx, cuentaId: string): Promise<number> {
  const todos = await saldosPorCuenta(tx);
  const f = todos.find((x) => x.cuenta.id === cuentaId);
  if (!f) throw new ErrorFinanzas("La cuenta no existe.");
  return f.saldoCentavos;
}

/** Cuenta el efectivo físico, lo compara con el saldo del sistema y registra la diferencia como ajuste. */
export async function registrarArqueo(tx: Tx, tenantId: string, e: { cuentaId: string; contadoCentavos: number; notas?: string; usuarioId?: string }) {
  if (!Number.isInteger(e.contadoCentavos) || e.contadoCentavos < 0) throw new ErrorFinanzas("El monto contado no puede ser negativo.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"arqueo" + e.cuentaId}, 0))`;
  const cuenta = await cuentaActiva(tx, e.cuentaId);
  if (cuenta.tipo !== "EFECTIVO") throw new ErrorFinanzas("Solo las cuentas de efectivo se arquean.");
  const teorico = await saldoCuenta(tx, cuenta.id);
  const dif = diferenciaArqueo(teorico, e.contadoCentavos);
  const { zona } = await contexto(tx, tenantId);
  const arqueo = await tx.arqueoCuenta.create({
    data: { tenantId, cuentaId: cuenta.id, teoricoCentavos: teorico, contadoCentavos: e.contadoCentavos, notas: e.notas?.trim() || null, realizadoPorId: e.usuarioId },
  });
  if (dif !== 0)
    await tx.ajusteCuenta.create({ data: { tenantId, cuentaId: cuenta.id, montoCentavos: dif, motivo: dif > 0 ? "Arqueo: sobrante" : "Arqueo: faltante", fecha: aDate(diaLocal(new Date(), zona)), arqueoId: arqueo.id } });
  return { arqueo, diferenciaCentavos: dif };
}

// ─── conexiones automáticas ──────────────────────────────────────────────────

/** Cuenta por defecto para un método de pago de reserva (la configura el administrador). */
function cuentaPorMetodo(cfg: { cuentaEfectivoId: string | null; cuentaTarjetaId: string | null; cuentaTransferenciaId: string | null }, metodo: MetodoPago) {
  return metodo === "EFECTIVO" ? cfg.cuentaEfectivoId : metodo === "TARJETA" ? cfg.cuentaTarjetaId : cfg.cuentaTransferenciaId;
}

/** Cada pago de reserva genera su ingreso (una sola vez). Devuelve null si no hay cuenta a donde llevarlo. */
export async function ingresoDesdePago(tx: Tx, tenantId: string, pagoId: string, cuentaId?: string | null) {
  const previo = await tx.ingreso.findUnique({ where: { pagoId } });
  if (previo) return previo;
  const pago = await tx.pago.findUnique({ where: { id: pagoId }, include: { reserva: { include: { cliente: true } } } });
  if (!pago) throw new ErrorFinanzas("El pago no existe.");
  const { base, zona, cfg } = await contexto(tx, tenantId);
  const destino = cuentaId ?? cuentaPorMetodo(cfg, pago.metodo);
  if (!destino) return null;
  const cuenta = await cuentaActiva(tx, destino);
  const cat = await categoriaPorClave(tx, tenantId, "RESERVAS");
  const m = armarMovimiento(cuenta.moneda, base, cfg.tipoCambio, { montoBaseCentavos: pago.montoCentavos });
  return tx.ingreso.create({
    data: {
      tenantId, concepto: `Reserva #${pago.reserva.folio} · ${pago.reserva.cliente.nombre}`, categoriaId: cat.id, cuentaId: cuenta.id, ...m,
      fecha: aDate(diaLocal(pago.pagadoEn, zona)), reservaId: pago.reservaId, pagoId: pago.id, origen: "PAGO_RESERVA",
    },
  });
}

/** Cada pago de una reserva de actividad genera su ingreso (una sola vez). Devuelve null si no hay cuenta a donde llevarlo. */
export async function ingresoDePagoActividad(tx: Tx, tenantId: string, pagoId: string, cuentaId?: string | null) {
  const previo = await tx.ingreso.findUnique({ where: { pagoActividadId: pagoId } });
  if (previo) return previo;
  const pago = await tx.pagoActividad.findUnique({ where: { id: pagoId }, include: { reserva: { include: { cliente: true } } } });
  if (!pago) throw new ErrorFinanzas("El pago no existe.");
  const { base, zona, cfg } = await contexto(tx, tenantId);
  const destino = cuentaId ?? cuentaPorMetodo(cfg, pago.metodo);
  if (!destino) return null;
  const cuenta = await cuentaActiva(tx, destino);
  const cat = await categoriaPorClave(tx, tenantId, "RESERVAS");
  const m = armarMovimiento(cuenta.moneda, base, cfg.tipoCambio, { montoBaseCentavos: pago.montoCentavos });
  return tx.ingreso.create({
    data: {
      tenantId, concepto: `Actividad #${pago.reserva.folio} · ${pago.reserva.cliente.nombre}`, categoriaId: cat.id, cuentaId: cuenta.id, ...m,
      fecha: aDate(diaLocal(pago.pagadoEn, zona)), pagoActividadId: pago.id, origen: "ACTIVIDAD",
    },
  });
}

/** Al eliminar el pago de una actividad, su ingreso queda cancelado (no se borra el rastro). */
export async function cancelarIngresoDePagoActividad(tx: Tx, pagoId: string, usuarioId?: string) {
  const i = await tx.ingreso.findUnique({ where: { pagoActividadId: pagoId } });
  if (i && i.estado === "ACTIVO") {
    await exigirNoConciliado(tx, { ingresoId: i.id });
    await tx.ingreso.update({ where: { id: i.id }, data: { estado: "CANCELADO", canceladoPorId: usuarioId, canceladoEn: new Date(), motivoCancelacion: "Pago de la actividad eliminado" } });
  }
}

/** Al eliminar un pago de reserva, su ingreso queda cancelado (no se borra el rastro). */
export async function cancelarIngresoDePago(tx: Tx, pagoId: string, usuarioId?: string) {
  const i = await tx.ingreso.findUnique({ where: { pagoId } });
  if (i && i.estado === "ACTIVO") {
    await exigirNoConciliado(tx, { ingresoId: i.id });
    await tx.ingreso.update({ where: { id: i.id }, data: { estado: "CANCELADO", canceladoPorId: usuarioId, canceladoEn: new Date(), motivoCancelacion: "Pago de la reserva eliminado" } });
  }
}

/** Un pago de nómina PAGADO genera su gasto. Si se cancela y se vuelve a pagar, se reactiva el mismo. */
export async function gastoDesdeNomina(tx: Tx, tenantId: string, pagoNominaId: string, cuentaId: string, usuarioId?: string) {
  const pago = await tx.pagoNomina.findUnique({ where: { id: pagoNominaId }, include: { empleado: true } });
  if (!pago) throw new ErrorFinanzas("El pago de nómina no existe.");
  if (pago.netoCentavos <= 0) return null;
  const { base, zona, cfg } = await contexto(tx, tenantId);
  const cuenta = await cuentaActiva(tx, cuentaId);
  const cat = await categoriaPorClave(tx, tenantId, "NOMINA");
  const m = armarMovimiento(cuenta.moneda, base, cfg.tipoCambio, { montoBaseCentavos: pago.netoCentavos });
  const datos = {
    concepto: `Nómina · ${pago.empleado.nombre} ${pago.empleado.apellido} · ${aIso(pago.periodoInicio)} a ${aIso(pago.periodoFin)}`.replace(/\s+/g, " "),
    categoriaId: cat.id, cuentaId: cuenta.id, ...m, fecha: aDate(diaLocal(pago.pagadoEn ?? new Date(), zona)),
    estado: "ACTIVO" as const, canceladoPorId: null, canceladoEn: null, motivoCancelacion: null,
  };
  const previo = await tx.gasto.findUnique({ where: { pagoNominaId } });
  if (previo) return tx.gasto.update({ where: { id: previo.id }, data: datos });
  return tx.gasto.create({ data: { ...datos, tenantId, pagoNominaId, origen: "NOMINA", registradoPorId: usuarioId } });
}

export async function cancelarGastoDeNomina(tx: Tx, pagoNominaId: string, usuarioId?: string) {
  const g = await tx.gasto.findUnique({ where: { pagoNominaId } });
  if (g && g.estado === "ACTIVO") {
    await exigirNoConciliado(tx, { gastoId: g.id });
    await tx.gasto.update({ where: { id: g.id }, data: { estado: "CANCELADO", canceladoPorId: usuarioId, canceladoEn: new Date(), motivoCancelacion: "Pago de nómina cancelado" } });
  }
}

/** Al anular una compra de inventario, su gasto queda cancelado (a menos que ya esté conciliado con el banco). */
export async function cancelarGastoDeInventario(tx: Tx, gastoId: string, usuarioId?: string) {
  const g = await tx.gasto.findUnique({ where: { id: gastoId } });
  if (g && g.estado === "ACTIVO") {
    await exigirNoConciliado(tx, { gastoId: g.id });
    await tx.gasto.update({ where: { id: g.id }, data: { estado: "CANCELADO", canceladoPorId: usuarioId, canceladoEn: new Date(), motivoCancelacion: "Compra de inventario anulada" } });
  }
}

/** Al anular el cobro de un traslado, su ingreso queda cancelado (a menos que ya esté conciliado con el banco). */
export async function cancelarIngresoDeTraslado(tx: Tx, ingresoId: string, usuarioId?: string) {
  const i = await tx.ingreso.findUnique({ where: { id: ingresoId } });
  if (i && i.estado === "ACTIVO") {
    await exigirNoConciliado(tx, { ingresoId: i.id });
    await tx.ingreso.update({ where: { id: i.id }, data: { estado: "CANCELADO", canceladoPorId: usuarioId, canceladoEn: new Date(), motivoCancelacion: "Cobro del traslado anulado" } });
  }
}

/** Un abono de comisiones genera su gasto. */
export async function gastoDesdeAbono(tx: Tx, tenantId: string, abonoId: string, cuentaId: string, usuarioId?: string) {
  const abono = await tx.abonoComision.findUnique({ where: { id: abonoId }, include: { beneficiario: true } });
  if (!abono) throw new ErrorFinanzas("El abono no existe.");
  const previo = await tx.gasto.findUnique({ where: { abonoComisionId: abonoId } });
  if (previo) return previo;
  const { base, zona, cfg } = await contexto(tx, tenantId);
  const cuenta = await cuentaActiva(tx, cuentaId);
  const cat = await categoriaPorClave(tx, tenantId, "COMISIONES");
  const m = armarMovimiento(cuenta.moneda, base, cfg.tipoCambio, { montoBaseCentavos: abono.montoCentavos });
  return tx.gasto.create({
    data: { tenantId, concepto: `Comisiones · ${abono.beneficiario.nombre}`, categoriaId: cat.id, cuentaId: cuenta.id, ...m, fecha: aDate(diaLocal(abono.fecha, zona)), origen: "COMISION", abonoComisionId: abonoId, registradoPorId: usuarioId },
  });
}

export async function cancelarGastoDeAbono(tx: Tx, abonoId: string, usuarioId?: string) {
  const g = await tx.gasto.findUnique({ where: { abonoComisionId: abonoId } });
  if (g && g.estado === "ACTIVO") {
    await exigirNoConciliado(tx, { gastoId: g.id });
    await tx.gasto.update({ where: { id: g.id }, data: { estado: "CANCELADO", canceladoPorId: usuarioId, canceladoEn: new Date(), motivoCancelacion: "Abono de comisiones anulado" } });
  }
}

/** Genera los ingresos de los pagos de reserva que aún no tienen uno (p. ej. los anteriores a activar el módulo). */
export async function sincronizarPagosComoIngresos(tx: Tx, tenantId: string) {
  const pagos = await tx.pago.findMany({ where: { ingreso: null }, select: { id: true }, orderBy: { pagadoEn: "asc" } });
  const r = { creados: 0, sinCuenta: 0 };
  for (const { id } of pagos) { if (await ingresoDesdePago(tx, tenantId, id)) r.creados++; else r.sinCuenta++; }
  return r;
}

export const TIPOS_CUENTA_ARQUEABLES: TipoCuenta[] = ["EFECTIVO"];
