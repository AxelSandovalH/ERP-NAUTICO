"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { pesosACentavos } from "@/lib/fechas";
import { tipoCambioValido } from "@/lib/finanzas/moneda";
import { ErrorFinanzas, cancelarTraspaso, crearTraspaso, obtenerConfig, registrarArqueo } from "@/lib/finanzas/servicio";
import type { EstadoForm } from "@/components/formulario";

const admin = () => requireModulo("cuentas", "cuentas:administrar");

async function conErrores(fn: () => Promise<EstadoForm>): Promise<EstadoForm> {
  try { return await fn(); } catch (e) {
    if (e instanceof ErrorFinanzas) return { error: e.message };
    throw e;
  }
}
const refrescar = () => { revalidatePath("/cuentas", "layout"); revalidatePath("/gastos", "layout"); revalidatePath("/ingresos", "layout"); };

const cuentaSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(80),
  tipo: z.enum(["EFECTIVO", "BANCO", "TARJETA_CREDITO", "PASARELA", "OTRA"]),
  moneda: z.enum(["MXN", "USD"]),
  saldoInicial: z.string().optional(),
  notas: z.string().trim().max(500).optional(),
});

export async function guardarCuenta(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = cuentaSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  let saldoInicialCentavos = 0;
  if (p.data.saldoInicial?.trim()) {
    const neg = p.data.saldoInicial.trim().startsWith("-");
    const c = pesosACentavos(p.data.saldoInicial.replace("-", ""));
    if (c === null) return { error: "Saldo inicial inválido." };
    saldoInicialCentavos = neg ? -c : c;
  }
  const activa = id === null || fd.get("activa") === "on";
  let nuevoId: string | null = null;
  const msg = await withTenant(s.tenantId, async (tx) => {
    try {
      if (id) {
        const previa = await tx.cuenta.findUnique({ where: { id } });
        if (!previa) return "Cuenta no encontrada.";
        // Cambiar la moneda con movimientos registrados falsearía todos sus montos
        if (previa.moneda !== p.data.moneda) {
          const usos = (await tx.gasto.count({ where: { cuentaId: id } })) + (await tx.ingreso.count({ where: { cuentaId: id } })) + (await tx.traspaso.count({ where: { OR: [{ origenId: id }, { destinoId: id }] } }));
          if (usos > 0) return "No se puede cambiar la moneda de una cuenta que ya tiene movimientos.";
        }
        await tx.cuenta.update({ where: { id }, data: { nombre: p.data.nombre, tipo: p.data.tipo, moneda: p.data.moneda, saldoInicialCentavos, notas: p.data.notas || null, activa } });
      } else {
        nuevoId = (await tx.cuenta.create({ data: { tenantId: s.tenantId, nombre: p.data.nombre, tipo: p.data.tipo, moneda: p.data.moneda, saldoInicialCentavos, notas: p.data.notas || null } })).id;
      }
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return "Ya tienes una cuenta con ese nombre.";
      throw e;
    }
    return null;
  });
  if (msg) return { error: msg };
  refrescar();
  if (nuevoId) redirect(`/cuentas/${nuevoId}`);
  return { ok: "Cambios guardados." };
}

const traspasoSchema = z.object({
  origenId: z.string().min(1), destinoId: z.string().min(1, "Elige la cuenta destino"), fecha: z.string(),
  monto: z.string().min(1, "Escribe el monto"), montoDestino: z.string().optional(), notas: z.string().trim().max(300).optional(),
});

export async function crearTraspasoAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = traspasoSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const monto = pesosACentavos(p.data.monto);
  const montoDestino = p.data.montoDestino?.trim() ? pesosACentavos(p.data.montoDestino) : null;
  if (!monto || monto <= 0) return { error: "Monto inválido." };
  if (p.data.montoDestino?.trim() && !montoDestino) return { error: "Monto recibido inválido." };
  return conErrores(async () => {
    await withTenant(s.tenantId, (tx) => crearTraspaso(tx, s.tenantId, { origenId: p.data.origenId, destinoId: p.data.destinoId, montoOrigenCentavos: monto, montoDestinoCentavos: montoDestino, fecha: p.data.fecha, notas: p.data.notas, usuarioId: s.usuarioId }));
    refrescar();
    return { ok: "Traspaso registrado." };
  });
}

export async function cancelarTraspasoAccion(id: string) {
  const s = await admin();
  try { await withTenant(s.tenantId, (tx) => cancelarTraspaso(tx, id)); } catch (e) { if (!(e instanceof ErrorFinanzas)) throw e; }
  refrescar();
}

export async function arqueoAccion(cuentaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const contado = pesosACentavos(String(fd.get("contado") ?? ""));
  if (contado === null) return { error: "Escribe cuánto efectivo contaste." };
  return conErrores(async () => {
    const r = await withTenant(s.tenantId, (tx) => registrarArqueo(tx, s.tenantId, { cuentaId, contadoCentavos: contado, notas: String(fd.get("notas") ?? ""), usuarioId: s.usuarioId }));
    refrescar();
    const d = r.diferenciaCentavos;
    return { ok: d === 0 ? "Cuadra exacto: no hay diferencia." : `Arqueo registrado: ${d > 0 ? "sobrante" : "faltante"} de ${(Math.abs(d) / 100).toFixed(2)}, ya ajustado en el saldo.` };
  });
}

const configSchema = z.object({
  tipoCambio: z.coerce.number(), cuentaEfectivoId: z.string().optional(), cuentaTarjetaId: z.string().optional(), cuentaTransferenciaId: z.string().optional(),
});

export async function guardarConfigAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = configSchema.safeParse(Object.fromEntries(fd));
  if (!p.success || !tipoCambioValido(p.data.tipoCambio)) return { error: "El tipo de cambio debe ser un número mayor a cero (pesos por dólar)." };
  const msg = await withTenant(s.tenantId, async (tx) => {
    await obtenerConfig(tx, s.tenantId);
    for (const id of [p.data.cuentaEfectivoId, p.data.cuentaTarjetaId, p.data.cuentaTransferenciaId])
      if (id && !(await tx.cuenta.findUnique({ where: { id }, select: { id: true } }))) return "Una de las cuentas elegidas no existe.";
    await tx.configFinanzas.update({
      where: { tenantId: s.tenantId },
      data: { tipoCambio: p.data.tipoCambio, cuentaEfectivoId: p.data.cuentaEfectivoId || null, cuentaTarjetaId: p.data.cuentaTarjetaId || null, cuentaTransferenciaId: p.data.cuentaTransferenciaId || null },
    });
    return null;
  });
  if (msg) return { error: msg };
  refrescar();
  return { ok: "Preferencias guardadas." };
}
