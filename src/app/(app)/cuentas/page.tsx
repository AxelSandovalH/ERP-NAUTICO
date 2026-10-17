import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { dinero } from "@/lib/fechas";
import { asegurarCategoriasBase, obtenerConfig, saldosPorCuenta } from "@/lib/finanzas/servicio";
import { TIPOS_CUENTA } from "@/lib/etiquetas";
import { Campo, Card, Input, Insignia, PageHeader, Select, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { CamposCuenta } from "@/components/form-cuenta";
import { guardarConfigAccion, guardarCuenta } from "./actions";

export const metadata = { title: "Cuentas · ERP Náutico" };

export default async function CuentasPage() {
  const s = await requireModulo("cuentas", "cuentas:administrar");
  const { saldos, cfg } = await withTenant(s.tenantId, async (tx) => {
    await asegurarCategoriasBase(tx, s.tenantId);
    return { saldos: await saldosPorCuenta(tx), cfg: await obtenerConfig(tx, s.tenantId) };
  });
  const activas = saldos.filter((x) => x.cuenta.activa);
  const total = (m: "MXN" | "USD") => activas.filter((x) => x.cuenta.moneda === m).reduce((a, x) => a + x.saldoCentavos, 0);
  const hayUsd = saldos.some((x) => x.cuenta.moneda === "USD");

  return (
    <>
      <PageHeader titulo="Cuentas y caja" sub="Dónde está el dinero: efectivo, bancos, tarjetas y pasarelas" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Total en pesos (MXN)</p><p className="mt-1 text-2xl font-semibold">{dinero(total("MXN"), "MXN")}</p></Card>
        <Card><p className="text-sm text-muted">Total en dólares (USD)</p><p className="mt-1 text-2xl font-semibold">{dinero(total("USD"), "USD")}</p></Card>
        <Card><p className="text-sm text-muted">Tipo de cambio de la empresa</p><p className="mt-1 text-2xl font-semibold">{cfg.tipoCambio.toLocaleString("es-MX", { maximumFractionDigits: 4 })}</p><p className="text-xs text-muted">pesos por dólar · base {s.moneda}</p></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {saldos.length === 0 ? <Vacio>Aún no tienes cuentas. Crea la primera (por ejemplo, tu caja de efectivo y tu banco).</Vacio> : (
            <Tabla>
              <thead><tr><Th>Cuenta</Th><Th>Tipo</Th><Th>Moneda</Th><Th>Saldo</Th></tr></thead>
              <tbody>
                {saldos.map(({ cuenta, saldoCentavos }) => (
                  <tr key={cuenta.id} className={`hover:bg-brand-soft/50 ${cuenta.activa ? "" : "opacity-60"}`}>
                    <Td><Link href={`/cuentas/${cuenta.id}`} className="font-medium text-brand">{cuenta.nombre}</Link>{!cuenta.activa && <> <Insignia>Inactiva</Insignia></>}</Td>
                    <Td className="text-xs">{TIPOS_CUENTA[cuenta.tipo]}</Td>
                    <Td>{cuenta.moneda}</Td>
                    <Td className={`font-semibold ${saldoCentavos < 0 ? "text-red-700 dark:text-red-300" : ""}`}>{dinero(saldoCentavos, cuenta.moneda)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">Nueva cuenta</h2>
            <Formulario accion={guardarCuenta.bind(null, null)} enviar="Crear cuenta"><CamposCuenta /></Formulario>
          </Card>
          <Card>
            <h2 className="mb-1 font-semibold">Preferencias</h2>
            <p className="mb-3 text-xs text-muted">Con estas cuentas por defecto, cada pago de una reserva genera solo su ingreso.</p>
            <Formulario accion={guardarConfigAccion} enviar="Guardar preferencias" className="space-y-3">
              <Campo etiqueta="Tipo de cambio (pesos por dólar)" ayuda={hayUsd ? undefined : "Se usa cuando agregues cuentas en dólares"}><Input name="tipoCambio" inputMode="decimal" defaultValue={String(cfg.tipoCambio)} required /></Campo>
              {([["cuentaEfectivoId", "Cobros en efectivo", cfg.cuentaEfectivoId], ["cuentaTarjetaId", "Cobros con tarjeta", cfg.cuentaTarjetaId], ["cuentaTransferenciaId", "Cobros por transferencia y otros", cfg.cuentaTransferenciaId]] as const).map(([name, etiqueta, valor]) => (
                <Campo key={name} etiqueta={etiqueta}>
                  <Select name={name} defaultValue={valor ?? ""}><option value="">— Elegir al cobrar —</option>{activas.map(({ cuenta }) => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre} ({cuenta.moneda})</option>)}</Select>
                </Campo>
              ))}
            </Formulario>
          </Card>
        </div>
      </div>
    </>
  );
}
