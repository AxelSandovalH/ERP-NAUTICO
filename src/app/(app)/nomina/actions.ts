"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, esIso, pesosACentavos } from "@/lib/fechas";
import { ErrorNomina, agregarConcepto, cancelarPago, generarNominaPeriodo, generarPago, marcarPagado, quitarConcepto } from "@/lib/nomina/servicio";
import { periodoDe, type Periodicidad } from "@/lib/nomina/periodos";
import type { EstadoForm } from "@/components/formulario";

const admin = () => requireModulo("nomina", "nomina:administrar");

async function conErrores(fn: () => Promise<EstadoForm>): Promise<EstadoForm> {
  try { return await fn(); } catch (e) {
    if (e instanceof ErrorNomina) return { error: e.message };
    throw e;
  }
}

const empSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(80),
  apellido: z.string().trim().max(80).optional(),
  puesto: z.string().trim().max(80).optional(),
  esquema: z.enum(["FIJO_PERIODO", "POR_DIA"]),
  sueldo: z.string().min(1, "Escribe el sueldo"),
  periodicidad: z.enum(["SEMANAL", "QUINCENAL", "MENSUAL"]),
  usuarioId: z.string().optional(),
  tripulanteId: z.string().optional(),
  notas: z.string().trim().max(1000).optional(),
});

export async function guardarEmpleado(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = empSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const sueldoCentavos = pesosACentavos(p.data.sueldo);
  if (!sueldoCentavos || sueldoCentavos <= 0) return { error: "El sueldo debe ser mayor a cero." };
  const activo = id === null || fd.get("activo") === "on";
  let nuevoId: string | null = null;
  const msg = await withTenant(s.tenantId, async (tx) => {
    if (p.data.usuarioId) {
      const u = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Usuario" WHERE id = ${p.data.usuarioId} AND "tenantId" = ${s.tenantId}`;
      if (u.length === 0) return "El usuario no existe.";
    }
    if (p.data.tripulanteId && !(await tx.tripulante.findUnique({ where: { id: p.data.tripulanteId }, select: { id: true } }))) return "El tripulante no existe.";
    const data = {
      nombre: p.data.nombre, apellido: p.data.apellido ?? "", puesto: p.data.puesto || null, esquema: p.data.esquema, sueldoCentavos,
      periodicidad: p.data.periodicidad, usuarioId: p.data.usuarioId || null, tripulanteId: p.data.tripulanteId || null, notas: p.data.notas || null, activo,
    };
    try {
      if (id) {
        const r = await tx.empleado.updateMany({ where: { id }, data });
        if (r.count === 0) return "Empleado no encontrado.";
      } else {
        nuevoId = (await tx.empleado.create({ data: { ...data, tenantId: s.tenantId } })).id;
      }
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return "Ese usuario o tripulante ya está ligado a otro empleado.";
      throw e;
    }
    return null;
  });
  if (msg) return { error: msg };
  revalidatePath("/nomina", "layout");
  revalidatePath("/asistencia", "layout");
  if (nuevoId) redirect(`/nomina/empleados/${nuevoId}`);
  return { ok: "Cambios guardados." };
}

export async function generarNominaAccion(periodicidad: Periodicidad, inicio: string): Promise<EstadoForm> {
  const s = await admin();
  if (!esIso(inicio)) return { error: "Periodo inválido." };
  return conErrores(async () => {
    const r = await withTenant(s.tenantId, (tx) => generarNominaPeriodo(tx, s.tenantId, periodicidad, periodoDe(periodicidad, inicio)), { timeoutMs: 120_000 });
    revalidatePath("/nomina", "layout");
    return { ok: `Listo: ${r.generados} pagos generados o recalculados${r.yaPagados ? `, ${r.yaPagados} ya estaban pagados` : ""}.` };
  });
}

export async function recalcularPagoAccion(pagoId: string): Promise<EstadoForm> {
  const s = await admin();
  return conErrores(async () => {
    await withTenant(s.tenantId, async (tx) => {
      const p = await tx.pagoNomina.findUnique({ where: { id: pagoId } });
      if (!p) throw new ErrorNomina("El pago no existe.");
      await generarPago(tx, s.tenantId, p.empleadoId, { inicio: aIso(p.periodoInicio), fin: aIso(p.periodoFin), etiqueta: "", dias: p.diasPeriodo });
    });
    revalidatePath("/nomina", "layout");
    return { ok: "Recalculado con la asistencia actual." };
  });
}

const conceptoSchema = z.object({
  tipo: z.enum(["BONO", "DEDUCCION"]),
  concepto: z.string().trim().min(2, "Escribe el concepto").max(120),
  monto: z.string().min(1, "Escribe el monto"),
  notas: z.string().trim().max(300).optional(),
});

export async function agregarConceptoAccion(pagoId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = conceptoSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const monto = pesosACentavos(p.data.monto);
  if (!monto || monto <= 0) return { error: "Monto inválido." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => agregarConcepto(tx, s.tenantId, pagoId, { tipo: p.data.tipo, concepto: p.data.concepto, montoCentavos: monto, notas: p.data.notas }));
    revalidatePath("/nomina", "layout");
    return { ok: p.data.tipo === "BONO" ? "Bono agregado." : "Deducción agregada." };
  });
}

export async function quitarConceptoAccion(conceptoId: string) {
  const s = await admin();
  try { await withTenant(s.tenantId, (tx) => quitarConcepto(tx, conceptoId)); } catch (e) { if (!(e instanceof ErrorNomina)) throw e; }
  revalidatePath("/nomina", "layout");
}

const pagoSchema = z.object({ metodo: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"]), referencia: z.string().trim().max(120).optional() });

export async function marcarPagadoAccion(pagoId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = pagoSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Datos inválidos." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => marcarPagado(tx, s.tenantId, pagoId, p.data));
    revalidatePath("/nomina", "layout");
    return { ok: "Pago registrado." };
  });
}

export async function cancelarPagoAccion(pagoId: string) {
  const s = await admin();
  try { await withTenant(s.tenantId, (tx) => cancelarPago(tx, pagoId)); } catch (e) { if (!(e instanceof ErrorNomina)) throw e; }
  revalidatePath("/nomina", "layout");
}
