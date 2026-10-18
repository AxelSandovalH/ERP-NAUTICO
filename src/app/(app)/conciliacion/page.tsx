import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero } from "@/lib/fechas";
import { saldosPorCuenta } from "@/lib/finanzas/servicio";
import { TIPOS_CUENTA } from "@/lib/etiquetas";
import { Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";

export const metadata = { title: "Conciliación bancaria · ERP Náutico" };

export default async function ConciliacionPage() {
  const s = await requireModulo("conciliacion", "conciliacion:administrar");
  const datos = await withTenant(s.tenantId, async (tx) => {
    const saldos = (await saldosPorCuenta(tx)).filter((x) => x.cuenta.activa && x.cuenta.tipo !== "EFECTIVO");
    const lineas = await tx.movimientoBanco.groupBy({ by: ["cuentaId", "estado"], _count: { _all: true } });
    const imports = await tx.importacionBanco.groupBy({ by: ["cuentaId"], _max: { creadoEn: true } });
    const cierres = await tx.cierreConciliacion.groupBy({ by: ["cuentaId"], _max: { mes: true } });
    return { saldos, lineas, imports, cierres };
  });
  const n = (cuentaId: string, estado: string) => datos.lineas.find((l) => l.cuentaId === cuentaId && l.estado === estado)?._count._all ?? 0;

  return (
    <>
      <PageHeader titulo="Conciliación bancaria" sub="Cuadra tus cuentas contra el estado de cuenta del banco" />
      {datos.saldos.length === 0 ? (
        <Vacio>No tienes cuentas bancarias. Crea una en <Link href="/cuentas" className="text-brand">Cuentas</Link> (banco, tarjeta o pasarela) para conciliarla. El efectivo se cuadra con el arqueo de caja.</Vacio>
      ) : (
        <Tabla>
          <thead><tr><Th>Cuenta</Th><Th>Saldo en el sistema</Th><Th>Por conciliar</Th><Th>Conciliados</Th><Th>Última importación</Th><Th>Último cierre</Th></tr></thead>
          <tbody>
            {datos.saldos.map(({ cuenta, saldoCentavos }) => {
              const pend = n(cuenta.id, "PENDIENTE");
              const ult = datos.imports.find((i) => i.cuentaId === cuenta.id)?._max.creadoEn;
              const cierre = datos.cierres.find((c) => c.cuentaId === cuenta.id)?._max.mes;
              return (
                <tr key={cuenta.id} className="hover:bg-brand-soft/50">
                  <Td><Link href={`/conciliacion/${cuenta.id}`} className="font-medium text-brand">{cuenta.nombre}</Link><span className="block text-xs text-muted">{TIPOS_CUENTA[cuenta.tipo]} · {cuenta.moneda}</span></Td>
                  <Td>{dinero(saldoCentavos, cuenta.moneda)}</Td>
                  <Td>{pend > 0 ? <Insignia tono="ambar">{pend} pendiente{pend === 1 ? "" : "s"}</Insignia> : <Insignia tono="verde">Al día</Insignia>}</Td>
                  <Td>{n(cuenta.id, "CONCILIADA")}</Td>
                  <Td className="text-xs">{ult ? aIso(ult) : "—"}</Td>
                  <Td className="text-xs">{cierre ?? "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
      <Card className="mt-6 text-sm text-muted">
        Descarga el estado de cuenta de tu banco (CSV o Excel), súbelo en la cuenta y confirma las parejas que el sistema sugiere. Al terminar el mes, ciérralo para bloquearlo.
      </Card>
    </>
  );
}
