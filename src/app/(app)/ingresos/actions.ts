"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { pesosACentavos } from "@/lib/fechas";
import { ErrorFinanzas, cancelarIngreso, confirmarIngreso, registrarIngreso, sincronizarPagosComoIngresos } from "@/lib/finanzas/servicio";
import type { EstadoForm } from "@/components/formulario";

const refrescar = () => { revalidatePath("/ingresos", "layout"); revalidatePath("/cuentas", "layout"); };
const admin = () => requireModulo("ingresos", "ingresos:administrar");

const schema = z.object({
  concepto: z.string().trim().min(2, "Escribe el concepto").max(160),
  monto: z.string().min(1, "Escribe el monto"),
  cuentaId: z.string().min(1, "Elige la cuenta donde entró"),
  fecha: z.string(),
  categoriaId: z.string().optional(),
  reservaFolio: z.string().optional(),
  notas: z.string().trim().max(1000).optional(),
  tipoCambio: z.string().optional(),
});

export async function registrarIngresoAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = schema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const monto = pesosACentavos(p.data.monto);
  if (!monto || monto <= 0) return { error: "Monto inválido." };
  const tc = p.data.tipoCambio?.trim() ? Number(p.data.tipoCambio) : null;
  if (p.data.tipoCambio?.trim() && (!Number.isFinite(tc) || (tc ?? 0) <= 0)) return { error: "Tipo de cambio inválido." };
  try {
    await withTenant(s.tenantId, async (tx) => {
      let reservaId: string | null = null;
      if (p.data.reservaFolio?.trim()) {
        const folio = Number(p.data.reservaFolio.replace("#", ""));
        const r = Number.isInteger(folio) ? await tx.reserva.findUnique({ where: { tenantId_folio: { tenantId: s.tenantId, folio } }, select: { id: true } }) : null;
        if (!r) throw new ErrorFinanzas(`No existe la reserva #${p.data.reservaFolio}.`);
        reservaId = r.id;
      }
      await registrarIngreso(tx, s.tenantId, { concepto: p.data.concepto, cuentaId: p.data.cuentaId, fecha: p.data.fecha, montoCentavos: monto, tipoCambio: tc, categoriaId: p.data.categoriaId || null, reservaId, notas: p.data.notas, usuarioId: s.usuarioId });
    });
  } catch (e) {
    if (e instanceof ErrorFinanzas) return { error: e.message };
    throw e;
  }
  refrescar();
  redirect("/ingresos");
}

export async function cancelarIngresoAccion(id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  try { await withTenant(s.tenantId, (tx) => cancelarIngreso(tx, id, s.usuarioId, String(fd.get("motivo") ?? ""))); }
  catch (e) { if (e instanceof ErrorFinanzas) return { error: e.message }; throw e; }
  refrescar();
  return { ok: "Ingreso cancelado." };
}

export async function confirmarIngresoAccion(id: string, confirmado: boolean) {
  const s = await admin();
  try { await withTenant(s.tenantId, (tx) => confirmarIngreso(tx, id, s.usuarioId, confirmado)); } catch (e) { if (!(e instanceof ErrorFinanzas)) throw e; }
  refrescar();
}

export async function sincronizarPagosAccion(): Promise<EstadoForm> {
  const s = await admin();
  const r = await withTenant(s.tenantId, (tx) => sincronizarPagosComoIngresos(tx, s.tenantId), { timeoutMs: 120_000 });
  refrescar();
  return { ok: `Listo: ${r.creados} ingresos creados${r.sinCuenta ? `; ${r.sinCuenta} pagos no tienen cuenta por defecto (configúrala en Cuentas → Preferencias)` : ""}.` };
}
