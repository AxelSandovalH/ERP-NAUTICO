"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { esIso, pesosACentavos } from "@/lib/fechas";
import { horaAMinutos } from "@/lib/reservas/disponibilidad";
import { ErrorReserva, crearReservaTx, validarDisponibilidad } from "@/lib/reservas/crear";
import { periodoCerrado, recalcularComisionReserva } from "@/lib/comisiones/servicio";
import { ErrorFinanzas, cancelarIngresoDePago, ingresoDesdePago } from "@/lib/finanzas/servicio";
import { aIso } from "@/lib/fechas";
import type { EstadoForm } from "@/components/formulario";

const schema = z.object({
  embarcacionId: z.string().min(1, "Elige una embarcación"),
  tarifaId: z.string().optional(),
  fecha: z.string(),
  inicio: z.string(),
  fin: z.string(),
  pax: z.coerce.number().int().min(1, "Indica los pasajeros"),
  origen: z.enum(["DIRECTO", "WEB", "AGENCIA", "CONCIERGE"]),
  total: z.string().optional(),
  notas: z.string().trim().max(2000).optional(),
  beneficiarioId: z.string().optional(),
  clienteId: z.string().optional(),
  clienteNombre: z.string().trim().max(120).optional(),
  clienteTelefono: z.string().trim().max(40).optional(),
  clienteEmail: z.string().trim().max(120).optional(),
});

export async function crearReserva(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("reservas", "reservas:escribir");
  const p = schema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  if (!esIso(d.fecha)) return { error: "Fecha inválida." };
  const inicioMin = horaAMinutos(d.inicio), finMin = horaAMinutos(d.fin);
  if (inicioMin === null || finMin === null) return { error: "Horario inválido." };
  if (!d.clienteId && !d.clienteNombre) return { error: "Elige un cliente o escribe el nombre de uno nuevo." };
  if (d.clienteEmail && !z.string().email().safeParse(d.clienteEmail).success) return { error: "Correo del cliente inválido." };

  let id: string;
  try {
    id = await withTenant(s.tenantId, async (tx) => {
      let clienteId = d.clienteId;
      if (clienteId) {
        if (!(await tx.cliente.findUnique({ where: { id: clienteId }, select: { id: true } })))
          throw new ErrorReserva("El cliente no existe.");
      } else {
        clienteId = (await tx.cliente.create({
          data: { tenantId: s.tenantId, nombre: d.clienteNombre!, telefono: d.clienteTelefono || null, email: d.clienteEmail || null },
        })).id;
      }
      let tarifaId: string | null = null;
      let total = d.total ? pesosACentavos(d.total) : null;
      if (d.tarifaId) {
        const t = await tx.tarifa.findFirst({ where: { id: d.tarifaId, embarcacionId: d.embarcacionId } });
        if (!t) throw new ErrorReserva("La tarifa no corresponde a la embarcación.");
        tarifaId = t.id;
        if (total === null) total = t.precioCentavos;
      }
      if (total === null) throw new ErrorReserva("Indica el total de la reserva.");
      let beneficiarioId: string | null = null;
      if (s.modulos.includes("comisiones") && d.beneficiarioId) {
        const b = await tx.beneficiario.findFirst({ where: { id: d.beneficiarioId, activo: true }, select: { id: true } });
        if (!b) throw new ErrorReserva("El beneficiario de la comisión no existe o está inactivo.");
        beneficiarioId = b.id;
      }
      const r = await crearReservaTx(tx, {
        tenantId: s.tenantId, embarcacionId: d.embarcacionId, clienteId, tarifaId, fecha: d.fecha,
        inicioMin, finMin, pax: d.pax, origen: d.origen, totalCentavos: total, notas: d.notas, creadorId: s.usuarioId, beneficiarioId,
      });
      if (s.modulos.includes("comisiones")) await recalcularComisionReserva(tx, s.tenantId, r.id, s.moneda);
      return r.id;
    });
  } catch (e) {
    if (e instanceof ErrorReserva) return { error: e.message };
    throw e;
  }
  revalidatePath("/reservas");
  revalidatePath("/calendario");
  redirect(`/reservas/${id}`);
}

const TRANSICIONES: Record<string, string[]> = {
  PENDIENTE: ["CONFIRMADA", "CANCELADA"],
  CONFIRMADA: ["COMPLETADA", "CANCELADA", "PENDIENTE"],
  COMPLETADA: [],
  CANCELADA: ["PENDIENTE"],
};

export async function cambiarEstado(reservaId: string, nuevo: "PENDIENTE" | "CONFIRMADA" | "COMPLETADA" | "CANCELADA") {
  const s = await requireModulo("reservas", "reservas:escribir");
  const msg = await withTenant(s.tenantId, async (tx) => {
    const r = await tx.reserva.findUnique({ where: { id: reservaId } });
    if (!r) return "Reserva no encontrada.";
    if (!TRANSICIONES[r.estado].includes(nuevo)) return `No se puede pasar de ${r.estado} a ${nuevo}.`;
    if (r.estado === "CANCELADA") {
      // Reactivar exige que el horario siga libre
      try {
        await validarDisponibilidad(tx, {
          tenantId: s.tenantId, embarcacionId: r.embarcacionId, clienteId: r.clienteId,
          fecha: r.fecha.toISOString().slice(0, 10), inicioMin: r.inicioMin, finMin: r.finMin,
          pax: r.pax, origen: r.origen, totalCentavos: r.totalCentavos, ignorarReservaId: r.id,
        });
      } catch (e) {
        if (e instanceof ErrorReserva) return e.message;
        throw e;
      }
    }
    await tx.reserva.update({ where: { id: reservaId }, data: { estado: nuevo } });
    if (s.modulos.includes("comisiones")) await recalcularComisionReserva(tx, s.tenantId, reservaId, s.moneda);
    return null;
  });
  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath("/reservas");
  revalidatePath("/calendario");
  return msg ? { error: msg } : { ok: true };
}

const pagoSchema = z.object({
  monto: z.string().min(1, "Escribe el monto"),
  metodo: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"]),
  referencia: z.string().trim().max(120).optional(),
});

export async function registrarPago(reservaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("reservas", "reservas:cobrar");
  const p = pagoSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const monto = pesosACentavos(p.data.monto);
  if (!monto || monto <= 0) return { error: "Monto inválido." };
  const cuentaElegida = String(fd.get("cuentaId") ?? "") || null;
  let sinCuenta = false;
  let msg: string | null;
  try {
    msg = await withTenant(s.tenantId, async (tx) => {
      const r = await tx.reserva.findUnique({ where: { id: reservaId }, include: { pagos: true } });
      if (!r) return "Reserva no encontrada.";
      if (r.estado === "CANCELADA") return "No se pueden registrar pagos en una reserva cancelada.";
      const pagado = r.pagos.reduce((a, x) => a + x.montoCentavos, 0);
      if (pagado + monto > r.totalCentavos) return "El pago excede el saldo pendiente.";
      const pago = await tx.pago.create({ data: { tenantId: s.tenantId, reservaId, montoCentavos: monto, metodo: p.data.metodo, referencia: p.data.referencia || null } });
      // Con el módulo de ingresos, el cobro entra solo a la cuenta elegida (o a la de su método de pago)
      if (s.modulos.includes("ingresos")) sinCuenta = (await ingresoDesdePago(tx, s.tenantId, pago.id, cuentaElegida)) === null;
      return null;
    });
  } catch (e) {
    if (e instanceof ErrorFinanzas) return { error: e.message };
    throw e;
  }
  if (msg) return { error: msg };
  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath("/ingresos", "layout");
  return { ok: sinCuenta ? "Pago registrado, pero sin ingreso: elige una cuenta o configura cuentas por defecto en Cuentas → Preferencias." : "Pago registrado." };
}

export async function eliminarPago(reservaId: string, pagoId: string) {
  const s = await requireModulo("reservas", "reservas:cobrar");
  await withTenant(s.tenantId, async (tx) => {
    // Su ingreso se cancela (no se borra el rastro) antes de eliminar el pago
    if (s.modulos.includes("ingresos")) await cancelarIngresoDePago(tx, pagoId, s.usuarioId);
    await tx.pago.deleteMany({ where: { id: pagoId, reservaId } });
  });
  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath("/ingresos", "layout");
}

const clienteSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(120),
  email: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(40).optional(),
  notas: z.string().trim().max(2000).optional(),
});

export async function guardarCliente(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("reservas", "reservas:escribir");
  const p = clienteSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (p.data.email && !z.string().email().safeParse(p.data.email).success) return { error: "Correo inválido." };
  const data = { nombre: p.data.nombre, email: p.data.email || null, telefono: p.data.telefono || null, notas: p.data.notas || null };
  if (id) {
    const r = await withTenant(s.tenantId, (tx) => tx.cliente.updateMany({ where: { id }, data }));
    if (r.count === 0) return { error: "Cliente no encontrado." };
    revalidatePath("/clientes");
    return { ok: "Cambios guardados." };
  }
  const c = await withTenant(s.tenantId, (tx) => tx.cliente.create({ data: { ...data, tenantId: s.tenantId } }));
  revalidatePath("/clientes");
  redirect(`/clientes/${c.id}`);
}

/** Cambia quién vendió la reserva y recalcula su comisión. Solo quien administra comisiones. */
export async function cambiarBeneficiario(reservaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("comisiones", "comisiones:administrar");
  const id = String(fd.get("beneficiarioId") ?? "");
  const msg = await withTenant(s.tenantId, async (tx) => {
    const r = await tx.reserva.findUnique({ where: { id: reservaId } });
    if (!r) return "Reserva no encontrada.";
    if (id && !(await tx.beneficiario.findFirst({ where: { id, activo: true }, select: { id: true } }))) return "Beneficiario no válido.";
    if (await periodoCerrado(tx, aIso(r.fecha).slice(0, 7))) return "El periodo de comisiones de esa fecha está cerrado. Reábrelo para cambiar al beneficiario.";
    const antes = await tx.comision.findUnique({ where: { reservaId } });
    if (antes && antes.pagadoCentavos > 0) return "Esta comisión ya tiene pagos aplicados; anula el abono antes de cambiar al beneficiario.";
    await tx.reserva.update({ where: { id: reservaId }, data: { beneficiarioId: id || null } });
    // La comisión pertenece a quien vendió (incluso un ajuste manual): al cambiar
    // de persona se descarta y se calcula desde cero para la nueva
    if (antes && antes.beneficiarioId !== (id || undefined)) await tx.comision.delete({ where: { id: antes.id } });
    await recalcularComisionReserva(tx, s.tenantId, reservaId, s.moneda);
    return null;
  });
  if (msg) return { error: msg };
  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath("/comisiones");
  return { ok: "Beneficiario actualizado." };
}
