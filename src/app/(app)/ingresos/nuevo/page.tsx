import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { hoyIso } from "@/lib/fechas";
import { asegurarCategoriasBase, obtenerConfig } from "@/lib/finanzas/servicio";
import { Card, PageHeader, Vacio } from "@/components/ui";
import { FormMovimiento } from "@/components/form-movimiento";
import { registrarIngresoAccion } from "../actions";

export const metadata = { title: "Nuevo ingreso · FleetNautic" };

export default async function NuevoIngresoPage() {
  const s = await requireModulo("ingresos", "ingresos:administrar");
  const d = await withTenant(s.tenantId, async (tx) => {
    await asegurarCategoriasBase(tx, s.tenantId);
    return {
      cuentas: await tx.cuenta.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } }),
      categorias: await tx.categoria.findMany({ where: { tipo: "INGRESO", activa: true }, orderBy: { orden: "asc" } }),
      cfg: await obtenerConfig(tx, s.tenantId),
    };
  });
  return (
    <>
      <PageHeader titulo="Nuevo ingreso" sub="Para dinero que entra y no viene del pago de una reserva (esos se generan solos)" />
      {d.cuentas.length === 0 ? <Vacio>Primero crea una cuenta en Cuentas.</Vacio> : (
        <Card className="max-w-3xl">
          <FormMovimiento tipo="ingreso" accion={registrarIngresoAccion} cuentas={d.cuentas.map((c) => ({ id: c.id, nombre: c.nombre, moneda: c.moneda }))}
            categorias={d.categorias.map((c) => ({ id: c.id, nombre: c.nombre }))} base={s.moneda === "USD" ? "USD" : "MXN"} tipoCambio={d.cfg.tipoCambio} hoy={hoyIso(s.zonaHoraria)} />
        </Card>
      )}
    </>
  );
}
