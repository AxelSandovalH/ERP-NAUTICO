import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { dinero } from "@/lib/fechas";
import { cantidadTexto } from "@/lib/inventario/cantidades";
import { asegurarUbicaciones, resumenInventario } from "@/lib/inventario/servicio";
import { Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Tile } from "@/components/graficas/tile";
import { SubnavInventario } from "@/components/inventario/subnav";

export const metadata = { title: "Inventario · FleetNautic" };

export default async function InventarioPage() {
  const s = await requireModulo("inventario", "inventario:ver");
  const { resumen, ubicaciones } = await withTenant(s.tenantId, async (tx) => {
    await asegurarUbicaciones(tx, s.tenantId);
    return { resumen: await resumenInventario(tx), ubicaciones: await tx.ubicacion.findMany({ select: { id: true, nombre: true } }) };
  });
  const nombreUb = new Map(ubicaciones.map((u) => [u.id, u.nombre]));
  const activos = resumen.articulos.filter((a) => a.activo);
  const bajos = activos.filter((a) => a.reabastecer);

  return (
    <>
      <PageHeader titulo="Inventario" sub="Existencias de tus insumos por almacén y embarcación" />
      <SubnavInventario activo="/inventario" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Tile etiqueta="Valor del inventario" valor={dinero(resumen.valorTotalCentavos, s.moneda)} nota="Existencia × costo promedio de compra" />
        <Tile etiqueta="Artículos" valor={String(activos.length)} />
        <Tile etiqueta="Por reabastecer" valor={String(bajos.length)} nota={bajos.length ? bajos.slice(0, 3).map((a) => a.nombre).join(", ") + (bajos.length > 3 ? "…" : "") : "Todo por encima de su mínimo"} />
      </div>
      {resumen.articulos.length === 0 ? <Vacio>Aún no tienes artículos. Créalos en «Artículos y ubicaciones» y registra tu inventario inicial como una compra sin cuenta.</Vacio> : (
        <Tabla>
          <thead><tr><Th>Artículo</Th><Th>Existencia</Th><Th>Mínimo</Th><Th>Dónde está</Th><Th>Costo prom.</Th><Th>Valor</Th></tr></thead>
          <tbody>
            {resumen.articulos.map((a) => (
              <tr key={a.id} className={a.activo ? "" : "opacity-60"}>
                <Td className="font-medium">{a.nombre}{a.categoria && <span className="block text-xs font-normal text-muted">{a.categoria}</span>}{!a.activo && <> <Insignia>Inactivo</Insignia></>}</Td>
                <Td className="whitespace-nowrap">
                  <span className={a.reabastecer ? "font-semibold text-red-700 dark:text-red-300" : ""}>{cantidadTexto(a.totalMilli)} {a.unidad}</span>
                  {a.reabastecer && <span className="ml-2"><Insignia tono="rojo">Reabastecer</Insignia></span>}
                </Td>
                <Td className="whitespace-nowrap text-muted">{a.minimoMilli > 0 ? `${cantidadTexto(a.minimoMilli)} ${a.unidad}` : "—"}</Td>
                <Td className="text-xs text-muted">{a.porUbicacion.size === 0 ? "—" : [...a.porUbicacion].map(([id, q]) => `${nombreUb.get(id) ?? "—"}: ${cantidadTexto(q)}`).join(" · ")}</Td>
                <Td className="whitespace-nowrap">{a.costoPromedioCentavos ? dinero(a.costoPromedioCentavos, s.moneda) : "—"}</Td>
                <Td className="whitespace-nowrap">{dinero(a.valorCentavos, s.moneda)}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
