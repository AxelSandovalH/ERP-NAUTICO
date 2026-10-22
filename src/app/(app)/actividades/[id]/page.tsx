import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, aIso, dinero, hoyIso } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { urlFoto } from "@/lib/storage/reglas";
import { lugaresLibres } from "@/lib/actividades/reglas";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { BotonLink, Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { FotoEmbarcacion } from "@/components/foto-embarcacion";
import { CamposActividad } from "@/components/actividades/form-actividad";
import { alternarActividadAccion, confirmarFotoActividadAccion, guardarActividadAccion, prepararFotoActividadAccion, quitarFotoActividadAccion } from "../actions";

export default async function ActividadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("actividades", "actividades:ver");
  const hoy = hoyIso(s.zonaHoraria);
  const a = await withTenant(s.tenantId, (tx) => tx.actividad.findUnique({
    where: { id },
    include: { salidas: { where: { fecha: { gte: aDate(hoy) }, estado: { not: "CANCELADA" } }, orderBy: [{ fecha: "asc" }, { inicioMin: "asc" }], take: 15, include: { reservas: { select: { pax: true, estado: true } }, embarcacion: true } } },
  }));
  if (!a) notFound();
  const editar = puede(s.rol, "actividades:escribir");
  return (
    <>
      <PageHeader titulo={a.nombre} sub={`${dinero(a.precioCentavos, s.moneda)} por persona · ${a.duracionMin / 60} h · cupo ${a.cupo}`}
        acciones={editar && <><BotonLink variante="suave" href="/actividades">← Actividades</BotonLink><BotonLink href={`/actividades/salidas/nueva?actividad=${a.id}`}>Programar salida</BotonLink></>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Foto</h2>
          <FotoEmbarcacion embarcacionId={a.id} url={urlFoto(a.fotoRuta)} puedeEditar={editar} acciones={{ preparar: prepararFotoActividadAccion, confirmar: confirmarFotoActividadAccion, quitar: quitarFotoActividadAccion }} />
          <h2 className="mb-4 mt-6 font-semibold">Datos</h2>
          {editar ? (
            <>
              <Formulario accion={guardarActividadAccion.bind(null, a.id)}><CamposActividad v={a} /></Formulario>
              <div className="mt-4 flex items-center gap-3 border-t border-line pt-4 text-sm">
                {a.activa ? <Insignia tono="verde">Activa</Insignia> : <Insignia>Inactiva</Insignia>}
                <BotonAccion etiqueta={a.activa ? "Desactivar" : "Activar"} accion={alternarActividadAccion.bind(null, a.id, !a.activa)} confirmar={a.activa ? "Una actividad inactiva no permite programar salidas nuevas. ¿Desactivar?" : undefined} />
              </div>
            </>
          ) : <p className="text-sm text-muted">Solo lectura para tu rol.</p>}
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Próximas salidas</h2>
          {a.salidas.length === 0 ? <Vacio>Sin salidas programadas.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Fecha</Th><Th>Hora</Th><Th>Lugares libres</Th><Th>Embarcación</Th></tr></thead>
              <tbody>
                {a.salidas.map((x) => (
                  <tr key={x.id} className="hover:bg-brand-soft/50">
                    <Td className="whitespace-nowrap"><Link href={`/actividades/salidas/${x.id}`} className="font-medium text-brand">{aIso(x.fecha)}</Link></Td>
                    <Td>{minutosAHora(x.inicioMin)}</Td>
                    <Td>{lugaresLibres(x.cupo, x.reservas)} de {x.cupo}</Td>
                    <Td className="text-xs">{x.embarcacion?.nombre ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {a.descripcion && <p className="mt-4 whitespace-pre-line text-sm text-muted">{a.descripcion}</p>}
          {a.puntoEncuentro && <p className="mt-2 text-sm"><span className="text-muted">Punto de encuentro:</span> {a.puntoEncuentro}</p>}
        </Card>
      </div>
    </>
  );
}
