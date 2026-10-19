import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero, diaLocal } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { ESTADOS_FACTURA, FORMAS_PAGO_SAT, MOTIVOS_CANCELACION, TONO_FACTURA, type Receptor } from "@/lib/facturacion/impuestos";
import { BotonLink, Campo, Card, Input, Insignia, PageHeader, Select } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { cancelarAccion, refrescarAccion, reintentarAccion } from "../actions";

export const maxDuration = 60;

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("facturacion", "facturacion:ver");
  const emitir = puede(s.rol, "facturacion:emitir");
  const f = await withTenant(s.tenantId, (tx) => tx.facturaEmitida.findUnique({ where: { id }, include: { cliente: true, reserva: { select: { id: true, folio: true } }, traslado: { select: { id: true, reserva: { select: { id: true, folio: true } } } } } }));
  if (!f) notFound();
  const r = f.receptor as unknown as Receptor;
  const origen = f.reserva ? { href: `/reservas/${f.reserva.id}`, texto: `Reserva #${f.reserva.folio}` } : { href: `/transporte/${f.traslado!.id}`, texto: `Traslado · Reserva #${f.traslado!.reserva.folio}` };
  const reintentable = f.estado === "ERROR" || f.estado === "SOLICITADA";

  return (
    <>
      <Link href="/facturacion" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Facturación</Link>
      <PageHeader titulo={`Factura · ${f.cliente.nombre}`} sub={`${origen.texto} · solicitada el ${diaLocal(f.creadoEn, s.zonaHoraria)}`} acciones={<Insignia tono={TONO_FACTURA[f.estado]}>{ESTADOS_FACTURA[f.estado]}</Insignia>} />

      {f.estado === "ERROR" && f.error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{f.error}</p>}
      {f.estado === "CANCELANDO" && <p role="status" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">La cancelación está en proceso: el SAT debe confirmarla y el cliente puede rechazarla. Consulta el estado en unos minutos.</p>}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">Comprobante</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Folio fiscal (UUID)</dt><dd className="break-all font-mono text-xs">{f.uuid ?? "—"}</dd></div>
              <div><dt className="text-muted">Origen</dt><dd><Link href={origen.href} className="text-brand">{origen.texto}</Link></dd></div>
              <div><dt className="text-muted">Forma de pago</dt><dd>{f.formaPago} · {FORMAS_PAGO_SAT[f.formaPago as keyof typeof FORMAS_PAGO_SAT] ?? "—"}</dd></div>
              <div><dt className="text-muted">Método de pago</dt><dd>{f.metodoPago}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              {f.procuraCfdiId && f.estado !== "SOLICITADA" && <><BotonLink href={`/facturacion/${f.id}/descargar?tipo=pdf`} variante="suave">Descargar PDF</BotonLink><BotonLink href={`/facturacion/${f.id}/descargar?tipo=xml`} variante="suave">Descargar XML</BotonLink></>}
              {emitir && f.procuraCfdiId && (f.estado === "TIMBRADA" || f.estado === "CANCELANDO") && <BotonAccion etiqueta="Consultar estado" accion={refrescarAccion.bind(null, f.id)} />}
              {emitir && reintentable && <BotonAccion variante="primario" etiqueta="Reintentar" accion={reintentarAccion.bind(null, f.id)} />}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold">Receptor</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">RFC</dt><dd className="font-mono">{r.rfc}</dd></div>
              <div><dt className="text-muted">Razón social</dt><dd>{r.razonSocial}</dd></div>
              <div><dt className="text-muted">Régimen fiscal</dt><dd>{r.regimenFiscal}</dd></div>
              <div><dt className="text-muted">Código postal</dt><dd>{r.codigoPostal}</dd></div>
              <div><dt className="text-muted">Uso del CFDI</dt><dd>{r.usoCfdi}</dd></div>
              <div><dt className="text-muted">Correo</dt><dd>{r.correo ?? "—"}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">Son los datos con que se timbró; no cambian si luego se edita el cliente.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">Importe</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{dinero(f.subtotalCentavos, s.moneda)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">IVA 16 %</dt><dd>{dinero(f.ivaCentavos, s.moneda)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd>{dinero(f.totalCentavos, s.moneda)}</dd></div>
            </dl>
          </Card>

          {emitir && f.estado === "TIMBRADA" && (
            <Card>
              <h2 className="mb-1 font-semibold">Cancelar factura</h2>
              <p className="mb-3 text-xs text-muted">Es un trámite fiscal real ante el SAT y no se puede deshacer. Si el cliente la rechaza, vuelve a quedar vigente.</p>
              <Formulario accion={cancelarAccion.bind(null, f.id)} enviar="Solicitar cancelación" variante="peligro">
                <div className="space-y-3">
                  <Campo etiqueta="Motivo"><Select name="motivo" defaultValue="02">{Object.entries(MOTIVOS_CANCELACION).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Campo>
                  <Campo etiqueta="Folio fiscal de la que la sustituye" ayuda="Solo con el motivo 01"><Input name="uuidSustituto" className="font-mono text-xs" /></Campo>
                  <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmar" className="mt-1" required /> Entiendo que la cancelación no se puede deshacer.</label>
                </div>
              </Formulario>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
