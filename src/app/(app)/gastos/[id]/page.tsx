import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { aIso, dinero } from "@/lib/fechas";
import { ORIGENES_MOVIMIENTO } from "@/lib/etiquetas";
import { Campo, Card, Input, Insignia, PageHeader } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { ComprobantesGasto } from "@/components/comprobantes-gasto";
import { cancelarGastoAccion } from "../actions";
import { BotonAccion } from "@/components/boton-accion";
import { desligarRecibidaAccion } from "../../facturacion/actions";

export default async function GastoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const { id } = await params;
  const { aviso } = await searchParams;
  const s = await requireModulo("gastos", "gastos:registrar");
  const g = await withTenant(s.tenantId, (tx) =>
    tx.gasto.findUnique({ where: { id }, include: { categoria: true, cuenta: true, embarcacion: true, reserva: { select: { id: true, folio: true } }, comprobantes: { orderBy: { creadoEn: "asc" } }, cfdi: true } }));
  if (!g) notFound();
  const cancelado = g.estado === "CANCELADO";
  const conFacturacion = s.modulos.includes("facturacion") && puede(s.rol, "facturacion:ver");
  const puedeCancelar = puede(s.rol, "gastos:administrar") && !cancelado && g.origen === "MANUAL";
  return (
    <>
      <Link href="/gastos" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Gastos</Link>
      <PageHeader titulo={g.concepto} sub={aIso(g.fecha)} acciones={cancelado ? <Insignia tono="rojo">Cancelado</Insignia> : g.origen !== "MANUAL" ? <Insignia>{ORIGENES_MOVIMIENTO[g.origen]}</Insignia> : undefined} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Detalle</h2>
          <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Monto</dt><dd className="text-lg font-semibold">{dinero(g.montoCentavos, g.moneda)}</dd>
            {g.moneda !== s.moneda && (<><dt className="text-muted">Equivale a</dt><dd>{dinero(g.montoBaseCentavos, s.moneda)} <span className="text-xs text-muted">(tipo de cambio {g.tipoCambio})</span></dd></>)}
            <dt className="text-muted">Cuenta</dt><dd>{g.cuenta.nombre} ({g.cuenta.moneda})</dd>
            <dt className="text-muted">Categoría</dt><dd>{g.categoria?.nombre ?? "—"}</dd>
            <dt className="text-muted">Embarcación</dt><dd>{g.embarcacion?.nombre ?? "—"}</dd>
            <dt className="text-muted">Reserva</dt><dd>{g.reserva ? <Link href={`/reservas/${g.reserva.id}`} className="text-brand">#{g.reserva.folio}</Link> : "—"}</dd>
            <dt className="text-muted">Proveedor</dt><dd>{g.proveedor ?? "—"}</dd>
            <dt className="text-muted">Factura</dt><dd>{g.requiereFactura ? "Hay que pedirla" : "No requerida"}</dd>
            {g.notas && (<><dt className="text-muted">Notas</dt><dd className="whitespace-pre-wrap">{g.notas}</dd></>)}
            {cancelado && (<><dt className="text-muted">Cancelación</dt><dd>{g.motivoCancelacion} <span className="text-xs text-muted">({g.canceladoEn?.toISOString().slice(0, 10)})</span></dd></>)}
          </dl>
        </Card>
        <div className="space-y-6">
          {conFacturacion && (
            <Card>
              <h2 className="mb-3 font-semibold">Factura del proveedor</h2>
              {g.cfdi ? (
                <div className="space-y-2 text-sm">
                  <p><Insignia tono="verde">Ligada</Insignia> {g.cfdi.nombreEmisor ?? g.cfdi.rfcEmisor} · {dinero(g.cfdi.totalCentavos, g.cfdi.moneda)}</p>
                  <p className="font-mono text-xs text-muted">{g.cfdi.uuid}</p>
                  <p className="text-xs text-muted">RFC {g.cfdi.rfcEmisor} · emitida el {aIso(g.cfdi.emitidoEn)}</p>
                  {puede(s.rol, "facturacion:emitir") && <BotonAccion etiqueta="Quitar vínculo" variante="peligro" confirmar="La factura quedará libre para ligarse a otro gasto. ¿Continuar?" accion={desligarRecibidaAccion.bind(null, g.id)} />}
                </div>
              ) : <p className="text-sm text-muted">{g.requiereFactura ? <>Aún no tiene factura ligada. Búscala en <Link href="/facturacion/recibidas" className="text-brand">Facturación → Recibidas</Link>.</> : "No se marcó como «requiere factura»."}</p>}
            </Card>
          )}
          <Card>
            <h2 className="mb-3 font-semibold">Comprobantes</h2>
            {aviso === "comprobantes" && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">El gasto se guardó, pero alguna foto no se pudo subir. Vuelve a agregarla aquí.</p>}
            <ComprobantesGasto gastoId={g.id} puedeSubir={!cancelado} puedeEliminarTodos={puede(s.rol, "gastos:administrar")} usuarioId={s.usuarioId}
              items={g.comprobantes.map((c) => ({ id: c.id, nombre: c.nombreOriginal, mime: c.mime, tamano: c.tamanoBytes }))} subidos={Object.fromEntries(g.comprobantes.map((c) => [c.id, c.subidoPorId]))} />
          </Card>
          {puedeCancelar && (
            <Card>
              <h2 className="mb-3 font-semibold">Cancelar gasto</h2>
              <p className="mb-3 text-xs text-muted">El registro se conserva pero deja de contar en saldos y totales.</p>
              <Formulario accion={cancelarGastoAccion.bind(null, g.id)} enviar="Cancelar gasto" variante="peligro" className="space-y-3">
                <Campo etiqueta="Motivo"><Input name="motivo" required /></Campo>
              </Formulario>
            </Card>
          )}
          {g.origen !== "MANUAL" && !cancelado && (
            <Card><p className="text-sm text-muted">{g.origen === "NOMINA" ? "Este gasto lo generó un pago de nómina. Si cancelas ese pago, este gasto se cancela solo." : "Este gasto lo generó un abono de comisiones. Si anulas el abono, este gasto se cancela solo."}</p></Card>
          )}
        </div>
      </div>
    </>
  );
}
