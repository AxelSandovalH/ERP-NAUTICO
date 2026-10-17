import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { aIso, dinero, hoyIso, mesDe, nombreMes, sumarMeses } from "@/lib/fechas";
import { ESTADOS_COMISION } from "@/lib/etiquetas";
import { BotonLink, Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { cerrarPeriodoAccion, recalcularPeriodoAccion, reabrirPeriodoAccion } from "./actions";
import { Campo, Input } from "@/components/ui";

export const metadata = { title: "Comisiones · ERP Náutico" };

export default async function ComisionesPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const sp = await searchParams;
  const s = await requireModulo("comisiones", "comisiones:ver_propias");
  const admin = puede(s.rol, "comisiones:administrar");
  const periodo = sp.periodo && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.periodo) ? sp.periodo : mesDe(hoyIso(s.zonaHoraria));

  const { propio, comisiones, cierre } = await withTenant(s.tenantId, async (tx) => {
    // Quien no administra solo ve las comisiones de su propio perfil de beneficiario
    const propio = admin ? null : await tx.beneficiario.findFirst({ where: { usuarioId: s.usuarioId }, select: { id: true } });
    const comisiones = admin || propio
      ? await tx.comision.findMany({
          where: { periodo, estado: { not: "CANCELADA" }, ...(admin ? {} : { beneficiarioId: propio!.id }) },
          include: { beneficiario: true, reserva: { include: { cliente: true, embarcacion: true } } },
          orderBy: [{ reserva: { fecha: "asc" } }, { reserva: { inicioMin: "asc" } }],
        })
      : [];
    const cierre = await tx.cierreComision.findFirst({ where: { periodo } });
    return { propio, comisiones, cierre };
  });
  const cerrado = !!cierre?.cerrado;

  const total = comisiones.reduce((a, c) => a + c.montoCentavos, 0);
  const pagado = comisiones.reduce((a, c) => a + c.pagadoCentavos, 0);
  const porBeneficiario = new Map<string, { id: string; nombre: string; n: number; monto: number; pagado: number }>();
  for (const c of comisiones) {
    const f = porBeneficiario.get(c.beneficiarioId) ?? { id: c.beneficiarioId, nombre: c.beneficiario.nombre, n: 0, monto: 0, pagado: 0 };
    f.n++; f.monto += c.montoCentavos; f.pagado += c.pagadoCentavos;
    porBeneficiario.set(c.beneficiarioId, f);
  }
  const sinTarifa = comisiones.filter((c) => c.advertencia).length;

  return (
    <>
      <PageHeader titulo="Comisiones" sub={`${nombreMes(periodo)}${cerrado ? " · periodo cerrado" : ""}`}
        acciones={<>
          <BotonLink variante="suave" href={`/comisiones?periodo=${sumarMeses(periodo, -1)}`}>←</BotonLink>
          <BotonLink variante="suave" href={`/comisiones?periodo=${mesDe(hoyIso(s.zonaHoraria))}`}>Este mes</BotonLink>
          <BotonLink variante="suave" href={`/comisiones?periodo=${sumarMeses(periodo, 1)}`}>→</BotonLink>
          {admin && <BotonLink href="/comisiones/beneficiarios">Beneficiarios y tarifas</BotonLink>}
        </>} />

      {!admin && !propio && <Vacio>Tu usuario aún no tiene perfil de comisiones. Pídele a un administrador que lo vincule a un beneficiario.</Vacio>}

      {(admin || propio) && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card><p className="text-sm text-muted">Comisiones del periodo ({comisiones.length})</p><p className="mt-1 text-2xl font-semibold">{dinero(total, s.moneda)}</p></Card>
            <Card><p className="text-sm text-muted">Pagado</p><p className="mt-1 text-2xl font-semibold">{dinero(pagado, s.moneda)}</p></Card>
            <Card><p className="text-sm text-muted">Pendiente</p><p className="mt-1 text-2xl font-semibold">{dinero(total - pagado, s.moneda)}</p></Card>
          </div>

          {sinTarifa > 0 && admin && (
            <p className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {sinTarifa} comisiones salieron en cero por falta de tarifa o de precio casa. Revísalas abajo.
            </p>
          )}

          {admin && (
            <Card className="mb-6">
              <h2 className="mb-3 font-semibold">Periodo {periodo}</h2>
              <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
                {cerrado ? (
                  <Formulario accion={reabrirPeriodoAccion.bind(null, periodo)} enviar="Reabrir periodo" variante="suave" className="flex flex-wrap items-end gap-3">
                    <Campo etiqueta="Motivo de la reapertura" className="min-w-64"><Input name="motivo" required /></Campo>
                  </Formulario>
                ) : (
                  <>
                    <Formulario accion={recalcularPeriodoAccion.bind(null, periodo)} enviar="Recalcular periodo" variante="suave" className="space-y-2">
                      <p className="max-w-xs text-xs text-muted">Aplica las tarifas vigentes a las comisiones del mes (salvo las ajustadas a mano).</p>
                    </Formulario>
                    <Formulario accion={cerrarPeriodoAccion.bind(null, periodo)} enviar="Cerrar periodo" variante="suave" className="space-y-2">
                      <p className="max-w-xs text-xs text-muted">Congela los montos del mes. Los pagos siguen permitidos.</p>
                    </Formulario>
                  </>
                )}
              </div>
            </Card>
          )}

          {admin && porBeneficiario.size > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 font-semibold">Por beneficiario</h2>
              <Tabla>
                <thead><tr><Th>Beneficiario</Th><Th>Reservas</Th><Th>Comisión</Th><Th>Pagado</Th><Th>Pendiente</Th></tr></thead>
                <tbody>
                  {[...porBeneficiario.values()].sort((a, b) => b.monto - a.monto).map((f) => (
                    <tr key={f.id}>
                      <Td><Link href={`/comisiones/beneficiarios/${f.id}`} className="font-medium text-brand">{f.nombre}</Link></Td>
                      <Td>{f.n}</Td><Td>{dinero(f.monto, s.moneda)}</Td><Td>{dinero(f.pagado, s.moneda)}</Td><Td>{dinero(f.monto - f.pagado, s.moneda)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </div>
          )}

          <h2 className="mb-3 font-semibold">Detalle</h2>
          {comisiones.length === 0 ? <Vacio>No hay comisiones en este periodo.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Reserva</Th><Th>Fecha</Th>{admin && <Th>Beneficiario</Th>}<Th>Embarcación</Th><Th>Base</Th><Th>Regla</Th><Th>Comisión</Th><Th>Estado</Th></tr></thead>
              <tbody>
                {comisiones.map((c) => (
                  <tr key={c.id}>
                    <Td><Link href={`/reservas/${c.reservaId}`} className="text-brand">#{c.reserva.folio}</Link><span className="block text-xs text-muted">{c.reserva.cliente.nombre}</span></Td>
                    <Td>{aIso(c.reserva.fecha)}</Td>
                    {admin && <Td>{c.beneficiario.nombre}</Td>}
                    <Td>{c.reserva.embarcacion.nombre}</Td>
                    <Td>{dinero(c.baseCentavos, s.moneda)}</Td>
                    <Td>
                      <span className="text-xs">{c.regla}</span>
                      {c.advertencia && <span className="block text-[11px] text-amber-700 dark:text-amber-300">⚠ {c.advertencia}</span>}
                    </Td>
                    <Td className="font-semibold">{dinero(c.montoCentavos, s.moneda)}</Td>
                    <Td>
                      <Insignia tono={c.estado === "PAGADA" ? "verde" : c.pagadoCentavos > 0 ? "azul" : "ambar"}>
                        {c.estado === "PENDIENTE" && c.pagadoCentavos > 0 ? "Parcial" : ESTADOS_COMISION[c.estado]}
                      </Insignia>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </>
      )}
    </>
  );
}
