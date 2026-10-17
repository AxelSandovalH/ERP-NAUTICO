"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { pesosACentavos } from "@/lib/fechas";
import {
  ErrorComision, ajustarMonto, anularAbono, cerrarPeriodo, reabrirPeriodo, recalcularPeriodo, registrarAbono,
} from "@/lib/comisiones/servicio";
import type { EstadoForm } from "@/components/formulario";

const admin = () => requireModulo("comisiones", "comisiones:administrar");

/** Ejecuta una operación del servicio y convierte sus errores de negocio en mensajes de formulario. */
async function conErrores(fn: () => Promise<EstadoForm>): Promise<EstadoForm> {
  try { return await fn(); } catch (e) {
    if (e instanceof ErrorComision) return { error: e.message };
    throw e;
  }
}

const benSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(100),
  tipo: z.enum(["VENDEDOR", "AGENCIA", "CONCIERGE", "OTRO"]),
  contacto: z.string().trim().max(200).optional(),
  usuarioId: z.string().optional(),
});

export async function guardarBeneficiario(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = benSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const activo = id === null || fd.get("activo") === "on";
  let nuevoId: string | null = null;
  const msg = await withTenant(s.tenantId, async (tx) => {
    if (p.data.usuarioId) {
      // Un usuario solo puede estar vinculado a un beneficiario, y debe ser de esta empresa
      const u = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Usuario" WHERE id = ${p.data.usuarioId} AND "tenantId" = ${s.tenantId}`;
      if (u.length === 0) return "El usuario no existe.";
      const otro = await tx.beneficiario.findFirst({ where: { usuarioId: p.data.usuarioId, ...(id ? { id: { not: id } } : {}) } });
      if (otro) return `Ese usuario ya está vinculado a ${otro.nombre}.`;
    }
    const data = { nombre: p.data.nombre, tipo: p.data.tipo, contacto: p.data.contacto || null, usuarioId: p.data.usuarioId || null, activo };
    try {
      if (id) {
        const r = await tx.beneficiario.updateMany({ where: { id }, data });
        if (r.count === 0) return "Beneficiario no encontrado.";
      } else {
        nuevoId = (await tx.beneficiario.create({ data: { ...data, tenantId: s.tenantId } })).id;
      }
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return "Ya existe un beneficiario con ese nombre.";
      throw e;
    }
    return null;
  });
  if (msg) return { error: msg };
  revalidatePath("/comisiones", "layout");
  if (nuevoId) redirect(`/comisiones/beneficiarios/${nuevoId}`);
  return { ok: "Cambios guardados." };
}

const tarifaSchema = z.object({
  embarcacionId: z.string().optional(),
  origen: z.enum(["", "DIRECTO", "WEB", "AGENCIA", "CONCIERGE"]).optional(),
  tipo: z.enum(["FIJO", "PORCENTAJE", "PORCENTAJE_BALANCE", "SIN"]),
  valor: z.string().optional(),
  umbralPax: z.string().optional(),
  valorAlto: z.string().optional(),
});

/** Monto fijo en pesos → centavos; porcentaje "12.5" → puntos base (1250). */
function aValor(tipo: string, texto: string | undefined): number | null {
  if (tipo === "SIN") return 0;
  if (!texto || !texto.trim()) return null;
  if (tipo === "FIJO") return pesosACentavos(texto);
  const n = Number(texto.replace(/[ %]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : null;
}

export async function crearTarifa(beneficiarioId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = tarifaSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Datos de la tarifa inválidos." };
  const d = p.data;
  const valor = aValor(d.tipo, d.valor);
  if (valor === null) return { error: d.tipo === "FIJO" ? "Escribe un monto válido." : "Escribe un porcentaje entre 0 y 100." };
  let umbralPax: number | null = null, valorAlto: number | null = null;
  if (d.umbralPax?.trim() || d.valorAlto?.trim()) {
    umbralPax = Number(d.umbralPax);
    valorAlto = aValor(d.tipo, d.valorAlto);
    if (!Number.isInteger(umbralPax) || umbralPax < 1 || valorAlto === null) return { error: "Para el valor por pasajeros indica el umbral (1 o más) y el valor." };
  }
  const msg = await withTenant(s.tenantId, async (tx) => {
    if (!(await tx.beneficiario.findUnique({ where: { id: beneficiarioId }, select: { id: true } }))) return "Beneficiario no encontrado.";
    if (d.embarcacionId && !(await tx.embarcacion.findUnique({ where: { id: d.embarcacionId }, select: { id: true } }))) return "Embarcación no encontrada.";
    // Una sola regla activa por (embarcación, origen): la nueva reemplaza a la anterior
    await tx.tarifaComision.deleteMany({ where: { beneficiarioId, embarcacionId: d.embarcacionId || null, origen: d.origen ? (d.origen as "WEB") : null } });
    await tx.tarifaComision.create({
      data: { tenantId: s.tenantId, beneficiarioId, embarcacionId: d.embarcacionId || null, origen: d.origen ? (d.origen as "WEB") : null, tipo: d.tipo, valor, umbralPax, valorAlto },
    });
    return null;
  });
  if (msg) return { error: msg };
  revalidatePath(`/comisiones/beneficiarios/${beneficiarioId}`);
  return { ok: "Tarifa guardada. Recalcula el periodo para aplicarla a comisiones ya generadas." };
}

export async function eliminarTarifa(beneficiarioId: string, tarifaId: string) {
  const s = await admin();
  await withTenant(s.tenantId, (tx) => tx.tarifaComision.deleteMany({ where: { id: tarifaId, beneficiarioId } }));
  revalidatePath(`/comisiones/beneficiarios/${beneficiarioId}`);
}

const abonoSchema = z.object({
  monto: z.string().min(1, "Escribe el monto"),
  metodo: z.enum(["EFECTIVO", "TARJETA", "TRANSFERENCIA", "OTRO"]),
  referencia: z.string().trim().max(120).optional(),
  notas: z.string().trim().max(500).optional(),
});

export async function registrarAbonoAccion(beneficiarioId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = abonoSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const monto = pesosACentavos(p.data.monto);
  if (!monto || monto <= 0) return { error: "Monto inválido." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => registrarAbono(tx, s.tenantId, { beneficiarioId, montoCentavos: monto, metodo: p.data.metodo, referencia: p.data.referencia, notas: p.data.notas, registradoPorId: s.usuarioId }));
    revalidatePath("/comisiones", "layout");
    return { ok: "Abono registrado y aplicado a las comisiones más antiguas." };
  });
}

export async function anularAbonoAccion(beneficiarioId: string, abonoId: string) {
  const s = await admin();
  await withTenant(s.tenantId, (tx) => anularAbono(tx, abonoId));
  revalidatePath("/comisiones", "layout");
}

export async function ajustarMontoAccion(comisionId: string, beneficiarioId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const monto = pesosACentavos(String(fd.get("monto") ?? ""));
  const motivo = String(fd.get("motivo") ?? "").trim();
  if (monto === null) return { error: "Monto inválido." };
  if (motivo.length < 3) return { error: "Indica el motivo del ajuste." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => ajustarMonto(tx, comisionId, monto, motivo));
    revalidatePath("/comisiones", "layout");
    return { ok: "Monto ajustado." };
  });
}

const periodoOk = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

export async function recalcularPeriodoAccion(periodo: string): Promise<EstadoForm> {
  const s = await admin();
  if (!periodoOk(periodo)) return { error: "Periodo inválido." };
  return conErrores(async () => {
    const r = await withTenant(s.tenantId, (tx) => recalcularPeriodo(tx, s.tenantId, periodo, s.moneda));
    revalidatePath("/comisiones", "layout");
    return { ok: `Listo: ${r.creada} creadas, ${r.actualizada} actualizadas.` };
  });
}

export async function cerrarPeriodoAccion(periodo: string): Promise<EstadoForm> {
  const s = await admin();
  if (!periodoOk(periodo)) return { error: "Periodo inválido." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => cerrarPeriodo(tx, s.tenantId, periodo, s.usuarioId));
    revalidatePath("/comisiones", "layout");
    return { ok: `Periodo ${periodo} cerrado.` };
  });
}

export async function reabrirPeriodoAccion(periodo: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  if (!periodoOk(periodo)) return { error: "Periodo inválido." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => reabrirPeriodo(tx, s.tenantId, periodo, s.usuarioId, String(fd.get("motivo") ?? "")));
    revalidatePath("/comisiones", "layout");
    return { ok: `Periodo ${periodo} reabierto.` };
  });
}
