"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { pesosACentavos } from "@/lib/fechas";
import { ErrorFinanzas, asegurarCategoriasBase, cancelarGasto, registrarGasto } from "@/lib/finanzas/servicio";
import type { EstadoForm } from "@/components/formulario";

const refrescar = () => { revalidatePath("/gastos", "layout"); revalidatePath("/cuentas", "layout"); };

const gastoSchema = z.object({
  concepto: z.string().trim().min(2, "Escribe el concepto").max(160),
  monto: z.string().min(1, "Escribe el monto"),
  cuentaId: z.string().min(1, "Elige la cuenta con la que se pagó"),
  fecha: z.string(),
  categoriaId: z.string().optional(),
  embarcacionId: z.string().optional(),
  reservaFolio: z.string().optional(),
  proveedor: z.string().trim().max(120).optional(),
  notas: z.string().trim().max(1000).optional(),
  tipoCambio: z.string().optional(),
});

export async function registrarGastoAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("gastos", "gastos:registrar");
  const p = gastoSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const monto = pesosACentavos(p.data.monto);
  if (!monto || monto <= 0) return { error: "Monto inválido." };
  const tc = p.data.tipoCambio?.trim() ? Number(p.data.tipoCambio) : null;
  if (p.data.tipoCambio?.trim() && (!Number.isFinite(tc) || (tc ?? 0) <= 0)) return { error: "Tipo de cambio inválido." };
  let id: string;
  try {
    id = await withTenant(s.tenantId, async (tx) => {
      let reservaId: string | null = null;
      if (p.data.reservaFolio?.trim()) {
        const folio = Number(p.data.reservaFolio.replace("#", ""));
        const r = Number.isInteger(folio) ? await tx.reserva.findUnique({ where: { tenantId_folio: { tenantId: s.tenantId, folio } }, select: { id: true } }) : null;
        if (!r) throw new ErrorFinanzas(`No existe la reserva #${p.data.reservaFolio}.`);
        reservaId = r.id;
      }
      const g = await registrarGasto(tx, s.tenantId, {
        concepto: p.data.concepto, cuentaId: p.data.cuentaId, fecha: p.data.fecha, montoCentavos: monto, tipoCambio: tc,
        categoriaId: p.data.categoriaId || null, embarcacionId: p.data.embarcacionId || null, reservaId,
        proveedor: p.data.proveedor, notas: p.data.notas, requiereFactura: fd.get("requiereFactura") === "on", usuarioId: s.usuarioId,
      });
      return g.id;
    });
  } catch (e) {
    if (e instanceof ErrorFinanzas) return { error: e.message };
    throw e;
  }
  refrescar();
  // El formulario con fotos necesita el id para subir los comprobantes antes de navegar
  if (fd.get("sinRedirect")) return { ok: "Gasto registrado.", id };
  redirect(`/gastos/${id}`);
}

export async function cancelarGastoAccion(id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("gastos", "gastos:administrar");
  try {
    await withTenant(s.tenantId, (tx) => cancelarGasto(tx, id, s.usuarioId, String(fd.get("motivo") ?? "")));
  } catch (e) {
    if (e instanceof ErrorFinanzas) return { error: e.message };
    throw e;
  }
  refrescar();
  return { ok: "Gasto cancelado." };
}

const catSchema = z.object({ tipo: z.enum(["GASTO", "INGRESO"]), nombre: z.string().trim().min(2, "Escribe el nombre").max(60) });

export async function crearCategoriaAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("gastos", "gastos:administrar");
  const p = catSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  try {
    await withTenant(s.tenantId, async (tx) => {
      await asegurarCategoriasBase(tx, s.tenantId);
      const max = await tx.categoria.aggregate({ where: { tipo: p.data.tipo }, _max: { orden: true } });
      await tx.categoria.create({ data: { tenantId: s.tenantId, tipo: p.data.tipo, nombre: p.data.nombre, orden: (max._max.orden ?? 0) + 1 } });
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "Ya existe una categoría con ese nombre." };
    throw e;
  }
  revalidatePath("/gastos", "layout");
  return { ok: "Categoría agregada." };
}

export async function alternarCategoriaAccion(id: string) {
  const s = await requireModulo("gastos", "gastos:administrar");
  await withTenant(s.tenantId, async (tx) => {
    const c = await tx.categoria.findUnique({ where: { id } });
    // Las categorías de sistema (nómina, comisiones, reservas) alimentan las conexiones automáticas
    if (c && !c.clave) await tx.categoria.update({ where: { id }, data: { activa: !c.activa } });
  });
  revalidatePath("/gastos", "layout");
}
