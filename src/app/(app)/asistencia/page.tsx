import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { aDate, esIso, fechaLarga, horaLocal, hoyIso, sumarDias } from "@/lib/fechas";
import { siguienteTipo } from "@/lib/asistencia/geocerca";
import { ESTADOS_DIA } from "@/lib/etiquetas";
import { BotonChecar } from "@/components/boton-checar";
import { BotonLink, Card, Campo, Input, Insignia, PageHeader, Select, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { fijarDiaAccion } from "./actions";

export const metadata = { title: "Asistencia · FleetNautic" };

export default async function AsistenciaPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const sp = await searchParams;
  const s = await requireModulo("asistencia", "asistencia:checar");
  const admin = puede(s.rol, "asistencia:administrar");
  const hoy = hoyIso(s.zonaHoraria);
  const dia = esIso(sp.dia) ? sp.dia : hoy;

  const { propio, checadasHoy, empleados } = await withTenant(s.tenantId, async (tx) => {
    const propio = await tx.empleado.findFirst({ where: { usuarioId: s.usuarioId }, select: { id: true, nombre: true, activo: true } });
    const checadasHoy = propio ? await tx.checada.findMany({ where: { empleadoId: propio.id, dia: aDate(hoy) }, orderBy: { fecha: "asc" }, include: { ubicacion: { select: { nombre: true } } } }) : [];
    let empleados: { id: string; nombre: string; apellido: string; puesto: string | null; entrada?: Date; salida?: Date; estado?: string; nota?: string | null }[] = [];
    if (admin) {
      const lista = await tx.empleado.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
      const checadas = await tx.checada.findMany({ where: { dia: aDate(dia) }, orderBy: { fecha: "asc" } });
      const manuales = await tx.diaAsistencia.findMany({ where: { fecha: aDate(dia) } });
      empleados = lista.map((e) => {
        const mias = checadas.filter((c) => c.empleadoId === e.id);
        const m = manuales.find((x) => x.empleadoId === e.id);
        return { id: e.id, nombre: e.nombre, apellido: e.apellido, puesto: e.puesto,
          entrada: mias.find((c) => c.tipo === "ENTRADA")?.fecha, salida: [...mias].reverse().find((c) => c.tipo === "SALIDA")?.fecha, estado: m?.estado, nota: m?.nota };
      });
    }
    return { propio, checadasHoy, empleados };
  });

  const ultima = checadasHoy[checadasHoy.length - 1]?.tipo ?? null;
  const proximo = siguienteTipo(ultima);
  return (
    <>
      <PageHeader titulo="Asistencia" sub={fechaLarga(hoy)}
        acciones={admin && <><BotonLink variante="suave" href="/asistencia/resumen">Resumen del periodo</BotonLink><BotonLink variante="suave" href="/asistencia/ubicaciones">Ubicaciones</BotonLink></>} />

      <Card className="mb-6 max-w-xl">
        <h2 className="mb-3 font-semibold">Mi asistencia de hoy</h2>
        {!propio ? (
          <p className="text-sm text-muted">Tu usuario no está ligado a un empleado, así que no puedes checar. Pídele a un administrador que lo vincule en Nómina → Empleados.</p>
        ) : !propio.activo ? (
          <p className="text-sm text-muted">Tu registro de empleado está inactivo.</p>
        ) : (
          <>
            <BotonChecar etiqueta={proximo === "ENTRADA" ? "Checar entrada" : "Checar salida"} />
            <p className="mt-2 text-xs text-muted">Debes estar dentro de una ubicación autorizada y permitir el acceso a tu ubicación.</p>
            {checadasHoy.length > 0 && (
              <ul className="mt-4 divide-y divide-line text-sm">
                {checadasHoy.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <span><Insignia tono={c.tipo === "ENTRADA" ? "verde" : "azul"}>{c.tipo === "ENTRADA" ? "Entrada" : "Salida"}</Insignia> <span className="ml-2 text-muted">{c.ubicacion?.nombre ?? "—"}</span></span>
                    <span className="font-medium tabular-nums">{horaLocal(c.fecha, s.zonaHoraria)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      {admin && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Equipo · {dia === hoy ? "hoy" : fechaLarga(dia)}</h2>
            <div className="flex gap-2">
              <BotonLink variante="suave" href={`/asistencia?dia=${sumarDias(dia, -1)}`}>←</BotonLink>
              <BotonLink variante="suave" href="/asistencia">Hoy</BotonLink>
              <BotonLink variante="suave" href={`/asistencia?dia=${sumarDias(dia, 1)}`}>→</BotonLink>
            </div>
          </div>
          {empleados.length === 0 ? <Vacio>No hay empleados activos. Agrégalos en Nómina → Empleados.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Empleado</Th><Th>Entrada</Th><Th>Salida</Th><Th>Estado del día</Th></tr></thead>
              <tbody>
                {empleados.map((e) => (
                  <tr key={e.id}>
                    <Td><Link href={`/nomina/empleados/${e.id}`} className="font-medium">{e.nombre} {e.apellido}</Link>{e.puesto && <span className="block text-xs text-muted">{e.puesto}</span>}</Td>
                    <Td className="tabular-nums">{e.entrada ? horaLocal(e.entrada, s.zonaHoraria) : "—"}</Td>
                    <Td className="tabular-nums">{e.salida ? horaLocal(e.salida, s.zonaHoraria) : "—"}</Td>
                    <Td>
                      <Formulario accion={fijarDiaAccion.bind(null, e.id, dia)} enviar="Guardar" variante="suave" className="flex flex-wrap items-end gap-2">
                        <Select name="estado" defaultValue={e.estado ?? ""} aria-label="Estado del día">
                          <option value="">{e.entrada ? "Presente (por checada)" : "Sin registro"}</option>
                          {Object.entries(ESTADOS_DIA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </Select>
                        <Campo etiqueta="" className="min-w-32 flex-1"><Input name="nota" defaultValue={e.nota ?? ""} placeholder="Nota" aria-label="Nota" /></Campo>
                      </Formulario>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          <p className="mt-3 text-xs text-muted">Elegir un estado corrige el día y manda sobre las checadas. Deja la opción «Presente / Sin registro» y guarda para quitar la corrección.</p>
        </>
      )}
    </>
  );
}
