"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { ErrorFacturacion, apiDeEmpresa, cancelarFactura, refrescarFactura, solicitarFactura, type Deps, type Origen } from "@/lib/facturacion/servicio";
import { ErrorRecibidas, desligarFactura, ligarFactura } from "@/lib/facturacion/recibidas-servicio";
import type { CfdiRecibido } from "@/lib/facturacion/recibidas";
import { ErrorProcura } from "@/lib/procura/cliente";
import { errorDeReceptor, normalizarRfc, type Receptor } from "@/lib/facturacion/impuestos";
import type { EstadoForm } from "@/components/formulario";

const emitir = () => requireModulo("facturacion", "facturacion:emitir");
const refrescar = () => { revalidatePath("/facturacion", "layout"); revalidatePath("/reservas", "layout"); revalidatePath("/transporte", "layout"); };

async function dependencias(s: { tenantId: string; usuarioId: string }): Promise<Deps> {
  const api = await withTenant(s.tenantId, (tx) => apiDeEmpresa(tx, s.tenantId));
  return { tenantId: s.tenantId, usuarioId: s.usuarioId, db: (fn) => withTenant(s.tenantId, fn), api };
}

async function conErrores<T extends EstadoForm | { error: string } | { ok: true }>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try { return await fn(); } catch (e) {
    if (e instanceof ErrorFacturacion) return { error: e.message };
    throw e;
  }
}

const emitirSchema = z.object({
  tipo: z.enum(["RESERVA", "TRASLADO"]), origenId: z.string().min(1),
  rfc: z.string().trim().max(20), razonSocial: z.string().trim().max(250), regimenFiscal: z.string().trim().max(3), codigoPostal: z.string().trim().max(5), usoCfdi: z.string().trim().max(3), correo: z.string().trim().max(120).optional(),
  formaPago: z.string().regex(/^\d{2}$/, "Elige la forma de pago"), metodoPago: z.enum(["PUE", "PPD"]),
});

/** Pide el CFDI de una reserva o traslado cobrado. Con éxito (o con un intento guardado) lleva al detalle de la factura. */
export async function emitirAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await emitir();
  const p = emitirSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const receptor: Receptor = { rfc: normalizarRfc(p.data.rfc), razonSocial: p.data.razonSocial, regimenFiscal: p.data.regimenFiscal, codigoPostal: p.data.codigoPostal, usoCfdi: p.data.usoCfdi.toUpperCase(), correo: p.data.correo || null };
  const err = errorDeReceptor(receptor);
  if (err) return { error: err };
  const origen: Origen = { tipo: p.data.tipo, id: p.data.origenId };
  const r = await conErrores(async () => {
    const d = await dependencias(s);
    const f = await solicitarFactura(d, { origen, receptor, formaPago: p.data.formaPago, metodoPago: p.data.metodoPago });
    // Guardar los datos fiscales en el cliente para la próxima vez (solo si se pidió)
    if (fd.get("guardarEnCliente") === "on") {
      await withTenant(s.tenantId, (tx) => tx.cliente.update({ where: { id: f.clienteId }, data: { rfc: receptor.rfc, razonSocialFiscal: receptor.razonSocial, regimenFiscal: receptor.regimenFiscal, codigoPostalFiscal: receptor.codigoPostal, usoCfdi: receptor.usoCfdi, correoFactura: receptor.correo } }));
    }
    refrescar();
    return { id: f.id } as EstadoForm;
  });
  if (r && "id" in r && r.id) redirect(`/facturacion/${r.id}`);
  // Un fallo del proveedor deja la factura en «Con error»: se manda al detalle para reintentar, no se pierde lo capturado
  if (r && "error" in r) {
    const previa = await withTenant(s.tenantId, (tx) => tx.facturaEmitida.findFirst({ where: origen.tipo === "RESERVA" ? { reservaId: origen.id } : { trasladoId: origen.id }, orderBy: { actualizadoEn: "desc" }, select: { id: true, estado: true } }));
    if (previa?.estado === "ERROR") redirect(`/facturacion/${previa.id}`);
  }
  return r;
}

export async function reintentarAccion(id: string) {
  const s = await emitir();
  const r = await conErrores(async () => {
    const f = await withTenant(s.tenantId, (tx) => tx.facturaEmitida.findUnique({ where: { id } }));
    if (!f) throw new ErrorFacturacion("La factura no existe.");
    if (f.estado !== "ERROR" && f.estado !== "SOLICITADA") throw new ErrorFacturacion("Solo se reintenta una factura con error.");
    const d = await dependencias(s);
    await solicitarFactura(d, { origen: f.reservaId ? { tipo: "RESERVA", id: f.reservaId } : { tipo: "TRASLADO", id: f.trasladoId! }, receptor: f.receptor as unknown as Receptor, formaPago: f.formaPago, metodoPago: f.metodoPago as "PUE" | "PPD" });
    return { ok: true as const };
  });
  refrescar();
  return r;
}

export async function refrescarAccion(id: string) {
  const s = await emitir();
  const r = await conErrores(async () => { await refrescarFactura(await dependencias(s), id); return { ok: true as const }; });
  refrescar();
  return r;
}

const cancelarSchema = z.object({ motivo: z.enum(["01", "02", "03"], { message: "Elige el motivo" }), uuidSustituto: z.string().trim().max(40).optional(), confirmar: z.literal("on", { message: "Confirma que entiendes que no se puede deshacer" }) });

export async function cancelarAccion(id: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await emitir();
  const p = cancelarSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const r = await conErrores(async () => { await cancelarFactura(await dependencias(s), id, { motivo: p.data.motivo, uuidSustituto: p.data.uuidSustituto }); return { ok: "Cancelación solicitada. El SAT la confirma en unos minutos u horas." } as EstadoForm; });
  refrescar();
  return r;
}

/**
 * Liga las facturas elegidas a sus gastos (campos `g_<gastoId>` = id del CFDI en Procura). Los datos de cada factura se piden de nuevo a Procura:
 * lo que mande el navegador solo dice CUÁL factura, nunca su importe ni su RFC. Todo en una transacción con un punto de guardado por gasto.
 */
export async function ligarRecibidasAccion(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await emitir();
  const elegidas = [...fd.entries()].filter((e): e is [string, string] => e[0].startsWith("g_") && typeof e[1] === "string" && !!e[1]).map(([k, v]) => ({ gastoId: k.slice(2), cfdiId: v }));
  if (elegidas.length === 0) return { error: "No elegiste ninguna factura." };
  const errores: string[] = [];
  let ligadas = 0;
  try {
    const api = await withTenant(s.tenantId, (tx) => apiDeEmpresa(tx, s.tenantId));
    const datos: { gastoId: string; cfdi: CfdiRecibido }[] = [];
    for (const e of elegidas) {
      const cfdi = await api.obtenerRecibida(e.cfdiId);
      if (cfdi) datos.push({ gastoId: e.gastoId, cfdi }); else errores.push("Una factura ya no está disponible en Procura.");
    }
    await withTenant(s.tenantId, async (tx) => {
      let n = 0;
      for (const d of datos) {
        const punto = `liga_${n++}`;
        await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
        try { await ligarFactura(tx, s.tenantId, { ...d, usuarioId: s.usuarioId }); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`); ligadas++; }
        catch (e) {
          await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
          if (!(e instanceof ErrorRecibidas) && (e as { code?: string }).code !== "P2002") throw e;
          errores.push((e as Error).message);
        }
      }
    }, { timeoutMs: 60_000 });
  } catch (e) {
    if (e instanceof ErrorFacturacion || e instanceof ErrorProcura) return { error: e.message };
    throw e;
  }
  refrescar();
  revalidatePath("/gastos", "layout");
  if (errores.length) return { error: `${ligadas ? `${ligadas} ligada${ligadas === 1 ? "" : "s"}. ` : ""}${errores.length} con problema: ${[...new Set(errores)].slice(0, 2).join(" ")}` };
  return { ok: `${ligadas} factura${ligadas === 1 ? "" : "s"} ligada${ligadas === 1 ? "" : "s"}.` };
}

export async function desligarRecibidaAccion(gastoId: string) {
  const s = await emitir();
  try { await withTenant(s.tenantId, (tx) => desligarFactura(tx, gastoId)); } catch (e) {
    if (e instanceof ErrorRecibidas) return { error: e.message };
    throw e;
  }
  refrescar();
  revalidatePath("/gastos", "layout");
  return { ok: true };
}
