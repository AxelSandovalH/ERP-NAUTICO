import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { dinero } from "@/lib/fechas";
import { datosDeReporte } from "@/lib/conciliacion/datos-reporte";
import { BotonLink, Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";

export const maxDuration = 120;

export default async function ReportePage({ params, searchParams }: { params: Promise<{ cuentaId: string }>; searchParams: Promise<{ mes?: string; saldo?: string }> }) {
  const { cuentaId } = await params;
  const q = await searchParams;
  const s = await requireModulo("conciliacion", "conciliacion:administrar");
  const d = await withTenant(s.tenantId, (tx) => datosDeReporte(tx, cuentaId, q.mes ?? "", q.saldo));
  if (!d) notFound();
  const volver = `/conciliacion/${cuentaId}?ver=cierres&mes=${q.mes ?? ""}`;
  if (!d.cuadre || !("soloBanco" in d)) return <><Link href={volver} className="text-sm text-muted">← Cierres</Link><Vacio>Para ver el reporte de {q.mes} indica el saldo del banco desde la pantalla de cierres.</Vacio></>;
  const m = d.cuenta.moneda, c = d.cuadre;
  return (
    <>
      <Link href={volver} className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Cierres</Link>
      <PageHeader titulo={`Diferencias · ${d.cuenta.nombre}`} sub={`${q.mes}${d.cierre ? " · mes cerrado" : " · mes abierto"}`} acciones={<BotonLink href={`/conciliacion/${cuentaId}/exportar?mes=${q.mes}&saldo=${c.saldoBancoCentavos / 100}`} variante="suave">Descargar CSV</BotonLink>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card><p className="text-sm text-muted">Banco</p><p className="mt-1 text-xl font-semibold">{dinero(c.saldoBancoCentavos, m)}</p></Card>
        <Card><p className="text-sm text-muted">Sistema</p><p className="mt-1 text-xl font-semibold">{dinero(c.saldoSistemaCentavos, m)}</p></Card>
        <Card><p className="text-sm text-muted">Diferencia</p><p className="mt-1 text-xl font-semibold">{dinero(c.diferencia, m)}</p></Card>
        <Card><p className="text-sm text-muted">Sin explicar</p><p className="mt-1 text-xl font-semibold">{c.sinExplicar === 0 ? <Insignia tono="verde">Cuadra</Insignia> : dinero(c.sinExplicar, m)}</p></Card>
      </div>
      <h2 className="mb-2 font-semibold">Solo en el banco ({d.soloBanco.length})</h2>
      {d.soloBanco.length === 0 ? <Vacio>Todo lo del banco está conciliado.</Vacio> : (
        <Tabla><thead><tr><Th>Fecha</Th><Th>Descripción</Th><Th>Importe</Th><Th>Estado</Th></tr></thead>
          <tbody>{d.soloBanco.map((l, i) => <tr key={i}><Td>{l.fecha}</Td><Td>{l.descripcion}</Td><Td>{dinero(l.montoCentavos, m)}</Td><Td>{l.estado}</Td></tr>)}</tbody></Tabla>
      )}
      <h2 className="mb-2 mt-8 font-semibold">Solo en el sistema ({c.soloSistema.length})</h2>
      {c.soloSistema.length === 0 ? <Vacio>Todo lo del sistema aparece en el banco.</Vacio> : (
        <Tabla><thead><tr><Th>Fecha</Th><Th>Concepto</Th><Th>Importe</Th></tr></thead>
          <tbody>{c.soloSistema.map((x) => <tr key={x.clave}><Td>{x.fecha}</Td><Td>{x.texto}</Td><Td>{dinero(x.montoCentavos, m)}</Td></tr>)}</tbody></Tabla>
      )}
    </>
  );
}
