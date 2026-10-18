"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { pesosACentavos } from "@/lib/fechas";
import { ErrorFinanzas } from "@/lib/finanzas/servicio";
import { MES_RE } from "@/lib/conciliacion/cierre";
import {
  ErrorConciliacion, cerrarMes, conciliar, crearDesdeLinea, desconciliar, ignorar, importarLineas, reabrirMes, restaurar,
} from "@/lib/conciliacion/servicio";
import type { EstadoForm } from "@/components/formulario";

const admin = () => requireModulo("conciliacion", "conciliacion:administrar");
const refrescar = () => revalidatePath("/conciliacion", "layout");
const esperado = (e: unknown) => e instanceof ErrorConciliacion || e instanceof ErrorFinanzas;

const lineaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descripcion: z.string().trim().min(1).max(300),
  montoCentavos: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= 2_000_000_000),
  saldoCentavos: z.number().int().nullable(),
  referencia: z.string().max(80).nullable(),
});
const mapeoSchema = z.object({
  fecha: z.number().int().min(0), descripcion: z.number().int().min(0), modo: z.enum(["unico", "separado"]),
  monto: z.number().int().nullable(), cargo: z.number().int().nullable(), abono: z.number().int().nullable(),
  saldo: z.number().int().nullable(), referencia: z.number().int().nullable(), invertir: z.boolean(), ordenFecha: z.enum(["dmy", "mdy"]),
});
const importSchema = z.object({ archivo: z.string().trim().min(1).max(200), mapeo: mapeoSchema, lineas: z.array(lineaSchema).min(1).max(5000) });

/** Guarda los renglones que el navegador ya leyó y validó; aquí se vuelven a validar. */
export async function importarAccion(cuentaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  let datos;
  try { datos = importSchema.safeParse(JSON.parse(String(fd.get("datos") ?? ""))); } catch { return { error: "El archivo no se pudo leer." }; }
  if (!datos.success) return { error: "El archivo tiene datos inválidos. Revisa las columnas." };
  try {
    const r = await withTenant(s.tenantId, (tx) => importarLineas(tx, s.tenantId, { cuentaId, archivo: datos.data.archivo, lineas: datos.data.lineas, mapeo: datos.data.mapeo, usuarioId: s.usuarioId }), { timeoutMs: 120_000 });
    refrescar();
    const extra = [r.duplicadas && `${r.duplicadas} ya estaban`, r.fueraDePeriodo && `${r.fueraDePeriodo} de meses cerrados se omitieron`].filter(Boolean).join("; ");
    return { ok: `${r.nuevas} movimiento${r.nuevas === 1 ? "" : "s"} nuevo${r.nuevas === 1 ? "" : "s"}${extra ? ` (${extra})` : ""}.` };
  } catch (e) {
    if (esperado(e)) return { error: (e as Error).message };
    throw e;
  }
}

/** Aplica lo que se eligió en la tabla: parejas, movimientos nuevos desde el banco y renglones sin pareja. Cada renglón es independiente. */
export async function conciliarAccion(cuentaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const categoriaGasto = String(fd.get("categoriaGasto") ?? "") || null, categoriaIngreso = String(fd.get("categoriaIngreso") ?? "") || null;
  const r = { conciliados: 0, creados: 0, ignorados: 0 };
  const errores: string[] = [];
  const filas = [...fd.entries()].filter((e): e is [string, string] => e[0].startsWith("m_") && typeof e[1] === "string" && !!e[1]);
  // Una sola transacción para toda la tanda (una por renglón sería lentísimo); cada renglón va en su propio
  // punto de guardado, así que uno que falle se revierte solo y los demás se aplican.
  await withTenant(s.tenantId, async (tx) => {
    let n = 0;
    for (const [campo, valor] of filas) {
      const lineaId = campo.slice(2), punto = `fila_${n++}`;
      await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
      try {
        if (valor === "nuevo") {
          const l = await tx.movimientoBanco.findUnique({ where: { id: lineaId }, select: { montoCentavos: true, cuentaId: true } });
          if (!l || l.cuentaId !== cuentaId) throw new ErrorConciliacion("El movimiento del banco no existe.");
          await crearDesdeLinea(tx, s.tenantId, lineaId, { categoriaId: l.montoCentavos < 0 ? categoriaGasto : categoriaIngreso, usuarioId: s.usuarioId });
          r.creados++;
        } else if (valor === "ignorar") { await ignorar(tx, lineaId, s.usuarioId); r.ignorados++; }
        else { await conciliar(tx, lineaId, valor, s.usuarioId); r.conciliados++; }
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
      } catch (e) {
        await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
        if (!esperado(e) && (e as { code?: string }).code !== "P2002") throw e;
        errores.push((e as Error).message);
      }
    }
  }, { timeoutMs: 120_000 });
  refrescar();
  const partes = [r.conciliados && `${r.conciliados} conciliado${r.conciliados === 1 ? "" : "s"}`, r.creados && `${r.creados} creado${r.creados === 1 ? "" : "s"} desde el banco`, r.ignorados && `${r.ignorados} sin pareja`].filter(Boolean);
  if (errores.length) return { error: `${partes.join(", ") || "Nada se aplicó"}. ${errores.length} con problema: ${[...new Set(errores)].slice(0, 2).join(" ")}` };
  return partes.length ? { ok: `Listo: ${partes.join(", ")}.` } : { error: "No elegiste nada que aplicar." };
}

async function uno(fn: (tx: Parameters<Parameters<typeof withTenant>[1]>[0], usuarioId: string) => Promise<unknown>) {
  const s = await admin();
  try { await withTenant(s.tenantId, (tx) => fn(tx, s.usuarioId)); } catch (e) {
    if (esperado(e)) return { error: (e as Error).message };
    throw e;
  }
  refrescar();
  return { ok: true };
}
export const desconciliarAccion = async (lineaId: string) => uno((tx) => desconciliar(tx, lineaId));
export const restaurarAccion = async (lineaId: string) => uno((tx) => restaurar(tx, lineaId));

const cierreSchema = z.object({ mes: z.string().regex(MES_RE, "Elige el mes"), saldoBanco: z.string().min(1, "Escribe el saldo final del estado de cuenta"), notas: z.string().trim().max(500).optional() });

export async function cerrarMesAccion(cuentaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = cierreSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const neg = p.data.saldoBanco.trim().startsWith("-");
  const abs = pesosACentavos(p.data.saldoBanco.replace("-", ""));
  if (abs === null) return { error: "Saldo del banco inválido." };
  try {
    await withTenant(s.tenantId, (tx) => cerrarMes(tx, s.tenantId, { cuentaId, mes: p.data.mes, saldoBancoCentavos: neg ? -abs : abs, notas: p.data.notas, usuarioId: s.usuarioId }));
  } catch (e) {
    if (esperado(e)) return { error: (e as Error).message };
    throw e;
  }
  refrescar();
  return { ok: `Mes ${p.data.mes} cerrado.` };
}

export async function reabrirMesAccion(cuentaId: string, mes: string) {
  const s = await admin();
  try { await withTenant(s.tenantId, (tx) => reabrirMes(tx, cuentaId, mes)); } catch (e) {
    if (esperado(e)) return { error: (e as Error).message };
    throw e;
  }
  refrescar();
  return { ok: true };
}
