import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { colorDeCategoria } from "@/lib/finanzas/colores";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { aDate, aIso, dinero, hoyIso, mesDe, nombreMes, sumarMeses } from "@/lib/fechas";
import { asegurarCategoriasBase } from "@/lib/finanzas/servicio";
import { ORIGENES_MOVIMIENTO } from "@/lib/etiquetas";
import { BotonLink, Card, Campo, Input, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { cancelarIngresoAccion, confirmarIngresoAccion, sincronizarPagosAccion } from "./actions";

export const metadata = { title: "Ingresos · FleetNautic" };

type SP = { mes?: string; cuenta?: string; sinConfirmar?: string };

export default async function IngresosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const s = await requireModulo("ingresos", "ingresos:ver");
  const admin = puede(s.rol, "ingresos:administrar");
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : mesDe(hoyIso(s.zonaHoraria));
  const where: Prisma.IngresoWhereInput = {
    fecha: { gte: aDate(`${mes}-01`), lt: aDate(`${sumarMeses(mes, 1)}-01`) },
    ...(sp.cuenta ? { cuentaId: sp.cuenta } : {}), ...(sp.sinConfirmar ? { confirmado: false, estado: "ACTIVO" } : {}),
  };
  const d = await withTenant(s.tenantId, async (tx) => {
    await asegurarCategoriasBase(tx, s.tenantId);
    const ingresos = await tx.ingreso.findMany({ where, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 300, include: { cuenta: true, categoria: true, reserva: { select: { id: true, folio: true } } } });
    const porCuenta = await tx.ingreso.groupBy({ by: ["cuentaId"], where: { ...where, estado: "ACTIVO" }, _sum: { montoCentavos: true } });
    const cuentas = await tx.cuenta.findMany({ orderBy: { nombre: "asc" } });
    const sinIngreso = await tx.pago.count({ where: { ingreso: null } });
    return { ingresos, porCuenta, cuentas, sinIngreso };
  });
  const activos = d.ingresos.filter((i) => i.estado === "ACTIVO");
  const total = activos.reduce((a, i) => a + i.montoBaseCentavos, 0);
  const qs = (m: string) => `/ingresos?${new URLSearchParams({ ...(sp.cuenta ? { cuenta: sp.cuenta } : {}), mes: m })}`;

  return (
    <>
      <PageHeader titulo="Ingresos" sub={nombreMes(mes)}
        acciones={<>
          <BotonLink variante="suave" href={qs(sumarMeses(mes, -1))}>←</BotonLink>
          <BotonLink variante="suave" href={qs(mesDe(hoyIso(s.zonaHoraria)))}>Este mes</BotonLink>
          <BotonLink variante="suave" href={qs(sumarMeses(mes, 1))}>→</BotonLink>
          {admin && <BotonLink href="/ingresos/nuevo">Nuevo ingreso</BotonLink>}
        </>} />

      {admin && d.sinIngreso > 0 && (
        <Card className="mb-4">
          <Formulario accion={sincronizarPagosAccion} enviar={`Generar ingresos de ${d.sinIngreso} pagos`} variante="suave" className="flex flex-wrap items-center gap-4">
            <p className="max-w-2xl text-sm text-muted">Hay <b className="text-foreground">{d.sinIngreso}</b> pagos de reservas que todavía no tienen su ingreso (por ejemplo, cobrados antes de activar este módulo, o sin una cuenta por defecto). Se llevan a la cuenta por defecto de su método de pago, configurada en Cuentas → Preferencias.</p>
          </Formulario>
        </Card>
      )}

      <form className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="mes" value={mes} />
        <label className="text-sm">Cuenta
          <select name="cuenta" defaultValue={sp.cuenta ?? ""} className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2"><option value="">Todas</option>{d.cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="sinConfirmar" value="1" defaultChecked={!!sp.sinConfirmar} /> Solo sin confirmar</label>
        <button className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-brand-soft">Filtrar</button>
      </form>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Total del periodo ({s.moneda})</p><p className="mt-1 text-3xl font-semibold">{dinero(total, s.moneda)}</p><p className="mt-1 text-xs text-muted">{activos.length} ingresos · los cancelados no suman</p></Card>
        <Card className="sm:col-span-2">
          <p className="mb-2 text-sm text-muted">Por cuenta</p>
          {d.porCuenta.length === 0 ? <p className="text-sm text-muted">Sin ingresos.</p> : (
            <ul className="space-y-1 text-sm">
              {d.porCuenta.map((x) => { const c = d.cuentas.find((k) => k.id === x.cuentaId); return <li key={x.cuentaId} className="flex justify-between"><span>{c?.nombre}</span><span className="tabular-nums">{dinero(x._sum.montoCentavos ?? 0, c?.moneda ?? "MXN")}</span></li>; })}
            </ul>
          )}
        </Card>
      </div>

      {d.ingresos.length === 0 ? <Vacio>No hay ingresos con estos filtros.</Vacio> : (
        <Tabla>
          <thead><tr><Th>Fecha</Th><Th>Concepto</Th><Th>Cuenta</Th><Th>Monto</Th><Th>Confirmado</Th><Th /></tr></thead>
          <tbody>
            {d.ingresos.map((i) => {
              const cancelado = i.estado === "CANCELADO";
              return (
                <tr key={i.id} className={cancelado ? "opacity-50" : ""}>
                  <Td className="whitespace-nowrap">{aIso(i.fecha)}</Td>
                  <Td>
                    <span className={cancelado ? "line-through" : "font-medium"}>{i.concepto}</span> {i.origen !== "MANUAL" && <Insignia>{ORIGENES_MOVIMIENTO[i.origen]}</Insignia>}
                    <span className="flex items-center gap-1.5 text-xs text-muted">{i.categoria && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorDeCategoria(i.categoria.nombre, i.categoria.color) }} />}<span>{[i.categoria?.nombre, i.reserva ? `reserva #${i.reserva.folio}` : null].filter(Boolean).join(" · ")}{cancelado && ` · cancelado: ${i.motivoCancelacion}`}</span></span>
                    {i.reserva && <Link href={`/reservas/${i.reserva.id}`} className="text-xs text-brand">ver reserva</Link>}
                  </Td>
                  <Td className="text-xs">{i.cuenta.nombre}</Td>
                  <Td className="whitespace-nowrap font-medium">{dinero(i.montoCentavos, i.moneda)}{i.moneda !== s.moneda && <span className="block text-xs font-normal text-muted">{dinero(i.montoBaseCentavos, s.moneda)}</span>}</Td>
                  <Td>{cancelado ? "—" : i.confirmado ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Sí</span> : admin ? <BotonAccion etiqueta="Confirmar" accion={confirmarIngresoAccion.bind(null, i.id, true)} /> : <span className="text-muted">Pendiente</span>}</Td>
                  <Td>
                    {admin && !cancelado && i.origen === "MANUAL" && (
                      <details><summary className="cursor-pointer text-xs text-muted hover:text-foreground">Cancelar</summary>
                        <Formulario accion={cancelarIngresoAccion.bind(null, i.id)} enviar="Cancelar ingreso" variante="peligro" className="mt-2 flex items-end gap-2"><Campo etiqueta="Motivo"><Input name="motivo" required /></Campo></Formulario>
                      </details>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
