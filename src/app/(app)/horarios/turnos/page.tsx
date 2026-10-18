import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { horasTexto, duracionMin, rangoTexto } from "@/lib/horarios/semana";
import { Campo, Card, Input, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { SubnavHorarios } from "@/components/horarios/subnav";
import { alternarPlantillaAccion, guardarPlantillaAccion } from "../actions";

export const metadata = { title: "Turnos · ERP Náutico" };

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function CamposTurno({ v }: { v?: { nombre: string; inicioMin: number; finMin: number; color: string } }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Campo etiqueta="Nombre"><Input name="nombre" defaultValue={v?.nombre} placeholder="Mañana" required /></Campo>
      <Campo etiqueta="Entrada"><Input type="time" name="entrada" defaultValue={v ? hhmm(v.inicioMin) : "08:00"} required /></Campo>
      <Campo etiqueta="Salida" ayuda="Si es menor que la entrada, cruza la medianoche"><Input type="time" name="salida" defaultValue={v ? hhmm(v.finMin) : "16:00"} required /></Campo>
      <Campo etiqueta="Color"><Input type="color" name="color" defaultValue={v?.color ?? "#0ea5e9"} className="h-10 p-1" /></Campo>
    </div>
  );
}

export default async function TurnosPage() {
  const s = await requireModulo("horarios", "horarios:administrar");
  const plantillas = await withTenant(s.tenantId, (tx) => tx.plantillaTurno.findMany({ orderBy: [{ activa: "desc" }, { inicioMin: "asc" }, { nombre: "asc" }] }));
  return (
    <>
      <PageHeader titulo="Turnos" sub="Tus turnos tipo, para asignar en la cuadrícula semanal" />
      <SubnavHorarios activo="/horarios/turnos" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {plantillas.length === 0 ? <Vacio>Aún no tienes turnos. Crea el primero (por ejemplo, Mañana 08:00–16:00).</Vacio> : (
            <Tabla>
              <thead><tr><Th>Turno</Th><Th>Horario</Th><Th>Duración</Th><Th /></tr></thead>
              <tbody>
                {plantillas.map((p) => (
                  <tr key={p.id} className={p.activa ? "" : "opacity-60"}>
                    <Td>
                      <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: p.color }} />
                      <span className="font-medium">{p.nombre}</span>{!p.activa && <> <Insignia>Inactivo</Insignia></>}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-brand">Editar</summary>
                        <div className="mt-3"><Formulario accion={guardarPlantillaAccion.bind(null, p.id)}><CamposTurno v={p} /></Formulario></div>
                      </details>
                    </Td>
                    <Td className="whitespace-nowrap">{rangoTexto(p.inicioMin, p.finMin)}</Td>
                    <Td>{horasTexto(duracionMin(p.inicioMin, p.finMin))}</Td>
                    <Td><BotonAccion etiqueta={p.activa ? "Desactivar" : "Activar"} accion={alternarPlantillaAccion.bind(null, p.id, !p.activa)} /></Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </div>
        <Card>
          <h2 className="mb-1 font-semibold">Nuevo turno</h2>
          <p className="mb-4 text-xs text-muted">Editar un turno no cambia lo que ya asignaste: solo los que asignes después.</p>
          <Formulario accion={guardarPlantillaAccion.bind(null, null)} enviar="Crear turno">
            <div className="space-y-3">
              <Campo etiqueta="Nombre"><Input name="nombre" placeholder="Mañana" required /></Campo>
              <Campo etiqueta="Entrada"><Input type="time" name="entrada" defaultValue="08:00" required /></Campo>
              <Campo etiqueta="Salida" ayuda="Menor que la entrada = cruza la medianoche"><Input type="time" name="salida" defaultValue="16:00" required /></Campo>
              <Campo etiqueta="Color"><Input type="color" name="color" defaultValue="#0ea5e9" className="h-10 p-1" /></Campo>
            </div>
          </Formulario>
        </Card>
      </div>
    </>
  );
}
