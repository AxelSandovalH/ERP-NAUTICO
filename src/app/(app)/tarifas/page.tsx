import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { dinero } from "@/lib/fechas";
import { TIPOS_EMBARCACION } from "@/lib/etiquetas";
import { Card, Campo, Input, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { crearTarifa, eliminarTarifa } from "../flota/actions";

export const metadata = { title: "Tarifas · FleetNautic" };

/** Las tarifas de todas las embarcaciones en un solo lugar (también se pueden editar desde la ficha de cada una). */
export default async function TarifasPage() {
  const s = await requireModulo("flota");
  const editar = puede(s.rol, "flota:escribir");
  const flota = await withTenant(s.tenantId, (tx) =>
    tx.embarcacion.findMany({ orderBy: { nombre: "asc" }, include: { tarifas: { orderBy: { duracionMin: "asc" } } } }));
  return (
    <>
      <PageHeader titulo="Tarifas" sub="Precio de cada tour por embarcación" />
      {flota.length === 0 ? <Vacio>Aún no registras embarcaciones. <Link href="/flota/nueva" className="text-brand underline">Agrega la primera</Link> para ponerle tarifas.</Vacio> : (
        <div className="space-y-6">
          {flota.map((e) => (
            <Card key={e.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: e.color }} />
                  <Link href={`/flota/${e.id}`} className="font-semibold hover:underline">{e.nombre}</Link>
                  <span className="text-sm text-muted">{TIPOS_EMBARCACION[e.tipo]} · hasta {e.capacidad} pax</span>
                </div>
              </div>
              {e.tarifas.length === 0 ? <Vacio>Sin tarifas.</Vacio> : (
                <Tabla>
                  <thead><tr><Th>Nombre</Th><Th>Duración</Th><Th>Precio</Th><Th /></tr></thead>
                  <tbody>
                    {e.tarifas.map((t) => (
                      <tr key={t.id}>
                        <Td>{t.nombre}</Td><Td>{t.duracionMin / 60} h</Td><Td>{dinero(t.precioCentavos, s.moneda)}</Td>
                        <Td>{editar && <BotonAccion accion={eliminarTarifa.bind(null, e.id, t.id)} etiqueta="Quitar" variante="peligro" confirmar="¿Quitar esta tarifa?" />}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              )}
              {editar && (
                <Formulario accion={crearTarifa.bind(null, e.id)} enviar="Agregar tarifa" className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Campo etiqueta="Nombre"><Input name="nombre" placeholder="Tour 4 horas" required /></Campo>
                  <Campo etiqueta="Horas"><Input name="horas" type="number" step="0.5" min="0.5" defaultValue="4" required /></Campo>
                  <Campo etiqueta={`Precio (${s.moneda})`}><Input name="precio" inputMode="decimal" placeholder="9500" required /></Campo>
                </Formulario>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
