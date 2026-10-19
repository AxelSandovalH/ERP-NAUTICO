import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { dinero, hoyIso, sumarDias } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { ErrorFacturacion, apiDeEmpresa } from "@/lib/facturacion/servicio";
import { gastosPendientesDeFactura, uuidsLigados } from "@/lib/facturacion/recibidas-servicio";
import { DIAS_ANTES, esFacturaUtil, sugerirFacturas, type CfdiRecibido } from "@/lib/facturacion/recibidas";
import { ErrorProcura } from "@/lib/procura/cliente";
import { Card, Insignia, PageHeader, Select, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { SubnavFacturacion } from "@/components/facturacion/subnav";
import { ligarRecibidasAccion } from "../actions";

export const metadata = { title: "Facturas recibidas · FleetNautic" };
export const maxDuration = 60;
const DIAS_MAX = 180;

export default async function RecibidasPage() {
  const s = await requireModulo("facturacion", "facturacion:ver");
  const emitir = puede(s.rol, "facturacion:emitir");
  const hoy = hoyIso(s.zonaHoraria);
  const { pendientes, ligados } = await withTenant(s.tenantId, async (tx) => ({ pendientes: await gastosPendientesDeFactura(tx), ligados: await uuidsLigados(tx) }));

  // Se piden a Procura solo las facturas desde unos días antes del gasto más viejo (con un tope), no toda la historia
  let cfdis: CfdiRecibido[] = [], falla: string | null = null;
  {
    const masViejo = pendientes.reduce((m, g) => (g.fecha < m ? g.fecha : m), hoy);
    const desde = [sumarDias(masViejo, -DIAS_ANTES), sumarDias(hoy, -DIAS_MAX)].sort().reverse()[0];
    try {
      const api = await withTenant(s.tenantId, (tx) => apiDeEmpresa(tx, s.tenantId));
      cfdis = (await api.listarRecibidas({ desde, hasta: hoy })).filter((c) => !ligados.has(c.uuid));
    } catch (e) {
      if (e instanceof ErrorFacturacion || e instanceof ErrorProcura) falla = e.message; else throw e;
    }
  }
  const sug = sugerirFacturas(pendientes, cfdis);
  const porId = new Map(cfdis.map((c) => [c.id, c]));
  const usadas = new Set([...sug.values()].map((x) => x.elegida).filter(Boolean));
  const sinGasto = cfdis.filter((c) => esFacturaUtil(c) && !usadas.has(c.id));

  return (
    <>
      <PageHeader titulo="Facturación" sub="Facturas que te emiten tus proveedores" />
      <SubnavFacturacion activo="/facturacion/recibidas" />
      {falla && <Card className="mb-6 border-amber-300 bg-amber-50 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">{falla}</Card>}

      <section className="mb-8">
        <h2 className="mb-1 font-semibold">Gastos que requieren factura</h2>
        <p className="mb-3 text-xs text-muted">Se propone la factura con el mismo importe (±$1), la misma moneda y fecha cercana; entre varias gana la del proveedor parecido. Revisa y aplica. Se marca «requiere factura» al registrar el gasto.</p>
        {pendientes.length === 0 ? <Vacio>No tienes gastos pendientes de factura.</Vacio> : (
          <Formulario accion={ligarRecibidasAccion} enviar="Ligar facturas elegidas">
            <Tabla>
              <thead><tr><Th>Gasto</Th><Th>Importe</Th><Th>Factura</Th></tr></thead>
              <tbody>
                {pendientes.map((g) => {
                  const x = sug.get(g.id)!;
                  return (
                    <tr key={g.id}>
                      <Td><span className="font-medium">{g.texto}</span><span className="block text-xs text-muted">{g.fecha}</span></Td>
                      <Td className="whitespace-nowrap font-medium">{dinero(g.montoCentavos, g.moneda)}</Td>
                      <Td>
                        {x.opciones.length === 0 ? <span className="text-xs text-muted">{falla ? "—" : "Aún no hay una factura que coincida."}</span> : (
                          <>
                            <Select name={`g_${g.id}`} defaultValue={x.elegida ?? ""} disabled={!emitir}>
                              <option value="">— decidir después —</option>
                              {x.opciones.map((o) => { const c = porId.get(o.cfdiId)!; return <option key={o.cfdiId} value={o.cfdiId}>{c.emitidoEn} · {c.nombreEmisor ?? c.rfcEmisor} · {dinero(c.totalCentavos, c.moneda)}</option>; })}
                            </Select>
                            {x.elegida && !x.segura && <Insignia tono="ambar">Revisar: hay varias opciones</Insignia>}
                          </>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          </Formulario>
        )}
      </section>

      {sinGasto.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Facturas recibidas sin gasto ({sinGasto.length})</h2>
          <p className="mb-3 text-xs text-muted">Te las emitieron y no corresponden a ningún gasto pendiente. Si es un gasto que no registraste, captúralo en Gastos y márcalo «requiere factura».</p>
          <Tabla>
            <thead><tr><Th>Fecha</Th><Th>Emisor</Th><Th>RFC</Th><Th>Total</Th></tr></thead>
            <tbody>{sinGasto.slice(0, 30).map((c) => <tr key={c.id}><Td className="whitespace-nowrap">{c.emitidoEn}</Td><Td>{c.nombreEmisor ?? "—"}</Td><Td className="font-mono text-xs">{c.rfcEmisor}</Td><Td className="whitespace-nowrap">{dinero(c.totalCentavos, c.moneda)}</Td></tr>)}</tbody>
          </Tabla>
        </section>
      )}
    </>
  );
}
