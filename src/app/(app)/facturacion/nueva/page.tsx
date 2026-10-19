import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { dinero } from "@/lib/fechas";
import { FORMAS_PAGO_SAT, METODOS_PAGO_SAT, desglosarIva } from "@/lib/facturacion/impuestos";
import { datosParaFacturar, receptorDeCliente, type Origen } from "@/lib/facturacion/servicio";
import { Campo, Card, Input, PageHeader, Select } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { ErrorFacturacion } from "@/lib/facturacion/servicio";
import { emitirAccion } from "../actions";

export const metadata = { title: "Facturar · ERP Náutico" };
export const maxDuration = 60; // el timbrado puede tardar unos segundos

export default async function NuevaFacturaPage({ searchParams }: { searchParams: Promise<{ reserva?: string; traslado?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("facturacion", "facturacion:emitir");
  const origen: Origen | null = q.reserva ? { tipo: "RESERVA", id: q.reserva } : q.traslado ? { tipo: "TRASLADO", id: q.traslado } : null;
  if (!origen) redirect("/facturacion");
  const d = await withTenant(s.tenantId, async (tx) => {
    try {
      const datos = await datosParaFacturar(tx, origen);
      const donde = origen.tipo === "RESERVA" ? { reservaId: origen.id } : { trasladoId: origen.id };
      const viva = await tx.facturaEmitida.findFirst({ where: { ...donde, estado: { in: ["SOLICITADA", "TIMBRADA", "CANCELANDO", "ERROR"] } }, select: { id: true } });
      return { datos, viva };
    } catch (e) {
      if (e instanceof ErrorFacturacion) return null;
      throw e;
    }
  });
  if (!d) redirect("/facturacion");
  if (d.viva) redirect(`/facturacion/${d.viva.id}`);
  const { datos } = d, imp = desglosarIva(datos.subtotalCentavos), r = receptorDeCliente(datos.cliente);

  return (
    <>
      <Link href="/facturacion" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Facturación</Link>
      <PageHeader titulo="Facturar" sub={datos.descripcion} />
      {!datos.cobrado ? <Card className="text-sm text-amber-800 dark:text-amber-200">{datos.motivoNoCobrado} Solo se factura lo ya cobrado.</Card> : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <Formulario accion={emitirAccion} enviar="Timbrar factura">
              <input type="hidden" name="tipo" value={origen.tipo} /><input type="hidden" name="origenId" value={origen.id} />
              <h2 className="font-semibold">Datos fiscales del cliente</h2>
              <p className="-mt-2 text-xs text-muted">Tal como aparecen en su constancia de situación fiscal. Un dato incorrecto produce una factura que luego hay que cancelar.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="RFC"><Input name="rfc" defaultValue={r.rfc} maxLength={13} className="uppercase" required autoComplete="off" /></Campo>
                <Campo etiqueta="Razón social"><Input name="razonSocial" defaultValue={r.razonSocial} required /></Campo>
                <Campo etiqueta="Régimen fiscal" ayuda="3 dígitos: 601, 612, 616…"><Input name="regimenFiscal" defaultValue={r.regimenFiscal} inputMode="numeric" maxLength={3} required /></Campo>
                <Campo etiqueta="Código postal fiscal"><Input name="codigoPostal" defaultValue={r.codigoPostal} inputMode="numeric" maxLength={5} required /></Campo>
                <Campo etiqueta="Uso del CFDI" ayuda="G03 gastos en general, S01 sin efectos fiscales…"><Input name="usoCfdi" defaultValue={r.usoCfdi} maxLength={3} className="uppercase" required /></Campo>
                <Campo etiqueta="Correo para enviarle la factura"><Input name="correo" type="email" defaultValue={r.correo ?? ""} /></Campo>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Forma de pago"><Select name="formaPago" defaultValue={datos.formaPagoSugerida}>{Object.entries(FORMAS_PAGO_SAT).map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}</Select></Campo>
                <Campo etiqueta="Método de pago"><Select name="metodoPago" defaultValue={datos.metodoPagoSugerido}>{Object.entries(METODOS_PAGO_SAT).map(([k, l]) => <option key={k} value={k}>{k} · {l}</option>)}</Select></Campo>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="guardarEnCliente" defaultChecked /> Guardar estos datos en el cliente para la próxima vez</label>
            </Formulario>
          </Card>
          <Card className="h-fit">
            <h2 className="mb-3 font-semibold">Importe</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{dinero(imp.subtotalCentavos, s.moneda)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">IVA 16 %</dt><dd>{dinero(imp.ivaCentavos, s.moneda)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total de la factura</dt><dd>{dinero(imp.totalCentavos, s.moneda)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">El precio de FleetNautic no incluye IVA: se suma al facturar. Cliente: {datos.cliente.nombre}.</p>
          </Card>
        </div>
      )}
    </>
  );
}
