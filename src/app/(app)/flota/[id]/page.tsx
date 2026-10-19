import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { aIso, dinero } from "@/lib/fechas";
import { Card, Campo, Input, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { CamposEmbarcacion } from "@/components/form-embarcacion";
import { FotoEmbarcacion } from "@/components/foto-embarcacion";
import { urlFoto } from "@/lib/storage/reglas";
import { actualizarEmbarcacion, confirmarFotoAccion, crearBloqueo, prepararFotoAccion, quitarFotoAccion, crearTarifa, eliminarBloqueo, eliminarTarifa } from "../actions";

export default async function EmbarcacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("flota");
  const e = await withTenant(s.tenantId, (tx) =>
    tx.embarcacion.findUnique({
      where: { id },
      include: { tarifas: { orderBy: { duracionMin: "asc" } }, bloqueos: { orderBy: { desde: "desc" }, take: 20 } },
    }));
  if (!e) notFound();
  const editar = puede(s.rol, "flota:escribir");
  return (
    <>
      <PageHeader titulo={e.nombre} sub="Datos, tarifas y bloqueos de disponibilidad" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Foto</h2>
          <FotoEmbarcacion embarcacionId={e.id} url={urlFoto(e.fotoRuta)} puedeEditar={editar} acciones={{ preparar: prepararFotoAccion, confirmar: confirmarFotoAccion, quitar: quitarFotoAccion }} />
          <h2 className="mb-4 mt-6 font-semibold">Datos</h2>
          {editar ? (
            <Formulario accion={actualizarEmbarcacion.bind(null, e.id)}><CamposEmbarcacion v={e} conEstado /></Formulario>
          ) : <p className="text-sm text-muted">Solo lectura para tu rol.</p>}
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">Tarifas</h2>
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

          <Card>
            <h2 className="mb-4 font-semibold">Bloqueos</h2>
            {e.bloqueos.length === 0 ? <Vacio>Sin bloqueos.</Vacio> : (
              <Tabla>
                <thead><tr><Th>Desde</Th><Th>Hasta</Th><Th>Motivo</Th><Th /></tr></thead>
                <tbody>
                  {e.bloqueos.map((b) => (
                    <tr key={b.id}>
                      <Td>{aIso(b.desde)}</Td><Td>{aIso(b.hasta)}</Td><Td>{b.motivo}</Td>
                      <Td>{editar && <BotonAccion accion={eliminarBloqueo.bind(null, e.id, b.id)} etiqueta="Quitar" variante="peligro" />}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
            {editar && (
              <Formulario accion={crearBloqueo.bind(null, e.id)} enviar="Bloquear fechas" className="mt-4 grid gap-3 sm:grid-cols-3">
                <Campo etiqueta="Desde"><Input name="desde" type="date" required /></Campo>
                <Campo etiqueta="Hasta (inclusive)"><Input name="hasta" type="date" required /></Campo>
                <Campo etiqueta="Motivo"><Input name="motivo" placeholder="Mantenimiento" required /></Campo>
              </Formulario>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
