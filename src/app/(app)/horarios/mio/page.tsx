import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { hoyIso } from "@/lib/fechas";
import { NOMBRES_DIA, horasTexto, lunesDe, minutosTrabajados, rangoTexto } from "@/lib/horarios/semana";
import { miHorario } from "@/lib/horarios/servicio";
import { Card, Insignia, PageHeader, Vacio } from "@/components/ui";

export const metadata = { title: "Mi horario · FleetNautic" };
const SEMANAS = 4;

export default async function MiHorarioPage() {
  const s = await requireModulo("horarios", "horarios:ver_propio");
  const hoy = hoyIso(s.zonaHoraria);
  const datos = await withTenant(s.tenantId, async (tx) => {
    const yo = await tx.empleado.findFirst({ where: { usuarioId: s.usuarioId, activo: true }, select: { id: true, nombre: true } });
    return yo ? { yo, semanas: await miHorario(tx, yo.id, lunesDe(hoy), SEMANAS) } : null;
  });

  return (
    <>
      <PageHeader titulo="Mi horario" sub="Tus turnos de las próximas semanas" />
      {!datos ? <Vacio>Tu usuario aún no está vinculado a una persona del equipo. Pídele a un administrador que lo haga en Horarios → Equipo.</Vacio> : (
        <div className="space-y-4">
          {datos.semanas.map((sem) => (
            <Card key={sem.lunes}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Semana del {sem.dias[0].dia.slice(8)}/{sem.dias[0].dia.slice(5, 7)} al {sem.dias[6].dia.slice(8)}/{sem.dias[6].dia.slice(5, 7)}</h2>
                {sem.publicada ? <span className="text-xs text-muted">{horasTexto(minutosTrabajados(sem.dias.flatMap((d) => (d.turno ? [d.turno] : []))))} en turno</span> : <Insignia>Aún no publicado</Insignia>}
              </div>
              {sem.publicada && (
                <ul className="grid gap-2 sm:grid-cols-7">
                  {sem.dias.map((d, i) => (
                    <li key={d.dia} className={`rounded-lg border p-2 text-sm ${d.dia === hoy ? "border-brand bg-brand-soft/50" : "border-line"}`} style={d.turno?.color ? { borderLeft: `4px solid ${d.turno.color}` } : undefined}>
                      <p className="text-xs uppercase text-muted">{NOMBRES_DIA[i]} {d.dia.slice(8)}</p>
                      {d.turno ? (
                        <>
                          <p className="font-medium">{d.turno.etiqueta}</p>
                          {d.turno.tipo === "TURNO" && d.turno.inicioMin !== null && d.turno.finMin !== null && <p className="text-xs text-muted">{rangoTexto(d.turno.inicioMin, d.turno.finMin)}</p>}
                        </>
                      ) : <p className="text-muted">—</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
