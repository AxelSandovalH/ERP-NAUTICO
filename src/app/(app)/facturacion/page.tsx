import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, aIso, dinero, hoyIso, sumarDias } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { ESTADOS_FACTURA, TONO_FACTURA, desglosarIva } from "@/lib/facturacion/impuestos";
import { BotonLink, Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";

export const metadata = { title: "Facturación · ERP Náutico" };
const VIVAS = ["SOLICITADA", "TIMBRADA", "CANCELANDO"];

export default async function FacturacionPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("facturacion", "facturacion:ver");
  const emitir = puede(s.rol, "facturacion:emitir");
  const hoy = hoyIso(s.zonaHoraria);
  const filtro = q.estado && q.estado in ESTADOS_FACTURA ? q.estado : null;
  const conTransporte = s.modulos.includes("transporte");

  const d = await withTenant(s.tenantId, async (tx) => {
    const conexion = await tx.conexionProcura.findUnique({ where: { tenantId: s.tenantId }, select: { activa: true, claveProdServ: true } });
    const facturas = await tx.facturaEmitida.findMany({ where: filtro ? { estado: filtro as keyof typeof ESTADOS_FACTURA } : {}, orderBy: { creadoEn: "desc" }, take: 100, include: { cliente: true, reserva: { select: { id: true, folio: true } }, traslado: { select: { id: true, reserva: { select: { folio: true } } } } } });
    const vivas = await tx.facturaEmitida.findMany({ where: { estado: { in: VIVAS as ("SOLICITADA" | "TIMBRADA" | "CANCELANDO")[] } }, select: { reservaId: true, trasladoId: true } });
    const conFactura = new Set(vivas.flatMap((f) => [f.reservaId, f.trasladoId]).filter(Boolean));
    // Pendientes de facturar: lo cobrado en los últimos 90 días que aún no tiene una factura viva
    const reservas = await tx.reserva.findMany({ where: { estado: { not: "CANCELADA" }, fecha: { gte: aDate(sumarDias(hoy, -90)) } }, orderBy: { fecha: "desc" }, take: 150, include: { cliente: true, pagos: { select: { montoCentavos: true } } } });
    const traslados = conTransporte ? await tx.traslado.findMany({ where: { estado: { not: "CANCELADO" }, ingresoId: { not: null }, precioCentavos: { gt: 0 }, fecha: { gte: aDate(sumarDias(hoy, -90)) } }, orderBy: { fecha: "desc" }, take: 100, include: { reserva: { include: { cliente: true } } } }) : [];
    return { conexion, facturas, conFactura, reservas, traslados };
  });
  const pendientes = [
    ...d.reservas.filter((r) => !d.conFactura.has(r.id) && r.totalCentavos > 0 && r.pagos.reduce((a, p) => a + p.montoCentavos, 0) >= r.totalCentavos)
      .map((r) => ({ clave: `r${r.id}`, etiqueta: `Reserva #${r.folio}`, cliente: r.cliente.nombre, fecha: aIso(r.fecha), subtotal: r.totalCentavos, href: `/facturacion/nueva?reserva=${r.id}` })),
    ...d.traslados.filter((t) => !d.conFactura.has(t.id)).map((t) => ({ clave: `t${t.id}`, etiqueta: `Traslado · Reserva #${t.reserva.folio}`, cliente: t.reserva.cliente.nombre, fecha: aIso(t.fecha), subtotal: t.precioCentavos, href: `/facturacion/nueva?traslado=${t.id}` })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  const lista = (e: string) => `/facturacion?estado=${e}`;

  return (
    <>
      <PageHeader titulo="Facturación" sub="CFDI de tus reservas y traslados cobrados" />
      {!d.conexion?.activa ? (
        <Card className="mb-6 border-amber-300 bg-amber-50 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <strong>La facturación aún no está conectada.</strong> Avisa a soporte para activar tu conexión con Procura y dar de alta tu emisor fiscal. Mientras tanto puedes capturar los datos fiscales de tus clientes.
        </Card>
      ) : !d.conexion.claveProdServ && <Card className="mb-6 text-sm text-amber-800 dark:text-amber-200">Falta configurar la clave de producto o servicio del SAT con que se facturan tus servicios. Avisa a soporte.</Card>}

      {emitir && pendientes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 font-semibold">Por facturar</h2>
          <p className="mb-3 text-xs text-muted">Cobrado en los últimos 90 días y sin factura. El IVA (16 %) se suma al precio.</p>
          <Tabla>
            <thead><tr><Th>Qué</Th><Th>Cliente</Th><Th>Fecha</Th><Th>Subtotal</Th><Th>Total con IVA</Th><Th /></tr></thead>
            <tbody>
              {pendientes.slice(0, 30).map((p) => (
                <tr key={p.clave}>
                  <Td className="font-medium">{p.etiqueta}</Td><Td>{p.cliente}</Td><Td className="whitespace-nowrap">{p.fecha}</Td>
                  <Td className="whitespace-nowrap">{dinero(p.subtotal, s.moneda)}</Td><Td className="whitespace-nowrap">{dinero(desglosarIva(p.subtotal).totalCentavos, s.moneda)}</Td>
                  <Td><BotonLink href={p.href} variante="suave">Facturar</BotonLink></Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Facturas emitidas</h2>
          <nav aria-label="Estado" className="flex flex-wrap gap-2 text-sm">
            <Link href="/facturacion" className={`rounded-full border px-3 py-1 ${!filtro ? "border-brand bg-brand-soft font-medium" : "border-line hover:bg-brand-soft/50"}`}>Todas</Link>
            {Object.entries(ESTADOS_FACTURA).map(([k, l]) => <Link key={k} href={lista(k)} className={`rounded-full border px-3 py-1 ${filtro === k ? "border-brand bg-brand-soft font-medium" : "border-line hover:bg-brand-soft/50"}`}>{l}</Link>)}
          </nav>
        </div>
        {d.facturas.length === 0 ? <Vacio>Aún no has emitido facturas{filtro ? " con ese estado" : ""}.</Vacio> : (
          <Tabla>
            <thead><tr><Th>Fecha</Th><Th>Qué</Th><Th>Cliente</Th><Th>Total</Th><Th>Folio fiscal</Th><Th>Estado</Th></tr></thead>
            <tbody>
              {d.facturas.map((f) => (
                <tr key={f.id} className="hover:bg-brand-soft/50">
                  <Td className="whitespace-nowrap"><Link href={`/facturacion/${f.id}`} className="text-brand">{aIso(f.creadoEn)}</Link></Td>
                  <Td>{f.reserva ? `Reserva #${f.reserva.folio}` : `Traslado · Reserva #${f.traslado?.reserva.folio}`}</Td>
                  <Td>{f.cliente.nombre}</Td>
                  <Td className="whitespace-nowrap">{dinero(f.totalCentavos, s.moneda)}</Td>
                  <Td className="font-mono text-xs">{f.uuid ? `${f.uuid.slice(0, 8)}…` : "—"}</Td>
                  <Td><Insignia tono={TONO_FACTURA[f.estado]}>{ESTADOS_FACTURA[f.estado]}</Insignia></Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </section>
    </>
  );
}
