import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { hoyIso } from "@/lib/fechas";
import { asegurarCategoriasBase, obtenerConfig } from "@/lib/finanzas/servicio";
import { Card, PageHeader, Vacio } from "@/components/ui";
import { FormGasto } from "@/components/form-gasto";

export const metadata = { title: "Nuevo gasto · ERP Náutico" };

export default async function NuevoGastoPage() {
  const s = await requireModulo("gastos", "gastos:registrar");
  const d = await withTenant(s.tenantId, async (tx) => {
    await asegurarCategoriasBase(tx, s.tenantId);
    return {
      cuentas: await tx.cuenta.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } }),
      categorias: await tx.categoria.findMany({ where: { tipo: "GASTO", activa: true }, orderBy: { orden: "asc" } }),
      flota: await tx.embarcacion.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
      cfg: await obtenerConfig(tx, s.tenantId),
    };
  });
  return (
    <>
      <PageHeader titulo="Nuevo gasto" />
      {d.cuentas.length === 0 ? <Vacio>Necesitas al menos una cuenta (efectivo, banco…) para registrar gastos. Pídele a un administrador que la cree en Cuentas.</Vacio> : (
        <Card className="max-w-3xl">
          <FormGasto cuentas={d.cuentas.map((c) => ({ id: c.id, nombre: c.nombre, moneda: c.moneda }))}
            categorias={d.categorias.map((c) => ({ id: c.id, nombre: c.nombre }))} embarcaciones={d.flota} base={s.moneda === "USD" ? "USD" : "MXN"} tipoCambio={d.cfg.tipoCambio} hoy={hoyIso(s.zonaHoraria)}
            iaDisponible={!!process.env.ANTHROPIC_API_KEY} />
        </Card>
      )}
    </>
  );
}
