"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { esIso, pesosACentavos } from "@/lib/fechas";
import { horaAMinutos } from "@/lib/reservas/disponibilidad";
import { ErrorReserva, crearReservaTx, validarDisponibilidad } from "@/lib/reservas/crear";
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
      const r = await crearReservaTx(tx, {
        tenantId: s.tenantId, embarcacionId: d.embarcacionId, clienteId, tarifaId, fecha: d.fecha,
        inicioMin, finMin, pax: d.pax, origen: d.origen, totalCentavos: total, notas: d.notas, creadorId: s.usuarioId,
      });
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
  const msg = await withTenant(s.tenantId, async (tx) => {
    const r = await tx.reserva.findUnique({ where: { id: reservaId }, include: { pagos: true } });
    if (!r) return "Reserva no encontrada.";
    if (r.estado === "CANCELADA") return "No se pueden registrar pagos en una reserva cancelada.";
    const pagado = r.pagos.reduce((a, x) => a + x.montoCentavos, 0);
    if (pagado + monto > r.totalCentavos) return "El pago excede el saldo pendiente.";
    await tx.pago.create({ data: { tenantId: s.tenantId, reservaId, montoCentavos: monto, metodo: p.data.metodo, referencia: p.data.referencia || null } });
    return null;
  });
  if (msg) return { error: msg };
  revalidatePath(`/reservas/${reservaId}`);
  return { ok: "Pago registrado." };
}

export async function eliminarPago(reservaId: string, pagoId: string) {
  const s = await requireModulo("reservas", "reservas:cobrar");
  await withTenant(s.tenantId, (tx) => tx.pago.deleteMany({ where: { id: pagoId, reservaId } }));
  revalidatePath(`/reservas/${reservaId}`);
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
