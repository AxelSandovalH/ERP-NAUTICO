import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, hoyIso, sumarDias } from "@/lib/fechas";
import { NOMBRES_DIA, TIPOS_AUSENCIA, diasDeSemana, horasTexto, lunesDe, esLunes, minutosTrabajados, rangoTexto } from "@/lib/horarios/semana";
import { semanaDe } from "@/lib/horarios/servicio";
import { Card, Insignia, PageHeader, Vacio } from "@/components/ui";
import { BotonAccion } from "@/components/boton-accion";
import { CeldaTurno, type OpcionTurno } from "@/components/horarios/celda-turno";
import { SubnavHorarios } from "@/components/horarios/subnav";
import { asignarAccion, copiarSemanaAccion, publicarAccion } from "./actions";

export const metadata = { title: "Horarios · ERP Náutico" };

export default async function HorariosPage({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("horarios", "horarios:administrar");
  const hoy = hoyIso(s.zonaHoraria);
  const lunes = q.semana && esLunes(q.semana) ? q.semana : lunesDe(q.semana && /^\d{4}-\d{2}-\d{2}$/.test(q.semana) ? q.semana : hoy);
  const dias = diasDeSemana(lunes);

  const { personas, turnos, publicada, plantillas } = await withTenant(s.tenantId, async (tx) => ({
    ...(await semanaDe(tx, s.tenantId, lunes)),
    plantillas: await tx.plantillaTurno.findMany({ where: { activa: true }, orderBy: [{ inicioMin: "asc" }, { nombre: "asc" }] }),
  }));
  const opcionesBase: OpcionTurno[] = [
    { valor: "", etiqueta: "—" },
    ...plantillas.map((p) => ({ valor: `p:${p.id}`, etiqueta: `${p.nombre} · ${rangoTexto(p.inicioMin, p.finMin)}` })),
    ...Object.entries(TIPOS_AUSENCIA).map(([valor, etiqueta]) => ({ valor, etiqueta })),
  ];
  const turnoDe = (empleadoId: string, dia: string) => turnos.find((t) => t.empleadoId === empleadoId && aIso(t.fecha) === dia);
  const enTurnoPorDia = dias.map((d) => turnos.filter((t) => aIso(t.fecha) === d && t.tipo === "TURNO").length);
  const rango = `${dias[0].slice(8)}/${dias[0].slice(5, 7)} al ${dias[6].slice(8)}/${dias[6].slice(5, 7)}/${dias[6].slice(0, 4)}`;

  return (
    <>
      <PageHeader titulo="Horarios" sub={`Semana del ${rango}`} />
      <SubnavHorarios activo="/horarios" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/horarios?semana=${sumarDias(lunes, -7)}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-brand-soft" aria-label="Semana anterior">←</Link>
          <Link href={`/horarios?semana=${lunesDe(hoy)}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-brand-soft">Esta semana</Link>
          <Link href={`/horarios?semana=${sumarDias(lunes, 7)}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-brand-soft" aria-label="Semana siguiente">→</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {publicada ? <Insignia tono="verde">Publicada</Insignia> : <Insignia tono="ambar">Borrador: el equipo aún no la ve</Insignia>}
          <BotonAccion etiqueta="Copiar semana anterior" accion={copiarSemanaAccion.bind(null, sumarDias(lunes, -7), lunes)} confirmar="Se copiará lo planeado la semana anterior a los días que estén vacíos. ¿Continuar?" />
          {publicada
            ? <BotonAccion etiqueta="Retirar publicación" variante="peligro" accion={publicarAccion.bind(null, lunes, false)} confirmar="El equipo dejará de ver esta semana. ¿Retirarla?" />
            : <BotonAccion etiqueta="Publicar semana" variante="primario" accion={publicarAccion.bind(null, lunes, true)} />}
        </div>
      </div>
      {publicada && <p className="mb-3 text-xs text-muted">Esta semana está publicada: cualquier cambio que hagas lo ve el equipo de inmediato.</p>}

      {personas.length === 0 ? (
        <Vacio>Aún no hay personas en el equipo. Agrégalas en <Link href="/horarios/equipo" className="text-brand">Equipo</Link>.</Vacio>
      ) : (
        <>
          {plantillas.length === 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">Crea tus turnos tipo (Mañana, Tarde…) en <Link href="/horarios/turnos" className="font-medium underline">Turnos</Link> para poder asignarlos. Mientras tanto solo puedes marcar descansos y ausencias.</p>}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[72rem] text-left text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 border-b border-line bg-surface px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Persona</th>
                  {dias.map((d, i) => (
                    <th key={d} className={`border-b border-line px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted ${d === hoy ? "bg-brand-soft" : ""}`}>{NOMBRES_DIA[i]} {d.slice(8)}</th>
                  ))}
                  <th className="border-b border-line px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted">Horas</th>
                </tr>
              </thead>
              <tbody>
                {personas.map((p) => {
                  const suyos = turnos.filter((t) => t.empleadoId === p.id);
                  const nombre = `${p.nombre} ${p.apellido}`.trim();
                  return (
                    <tr key={p.id}>
                      <td className="sticky left-0 border-b border-line bg-surface px-4 py-2 font-medium">{nombre}{p.puesto && <span className="block text-xs font-normal text-muted">{p.puesto}</span>}</td>
                      {dias.map((d) => {
                        const t = turnoDe(p.id, d);
                        const opciones = t?.tipo === "TURNO" ? [...opcionesBase, { valor: "actual", etiqueta: `${t.etiqueta} · ${rangoTexto(t.inicioMin!, t.finMin!)}` }] : opcionesBase;
                        const valor = !t ? "" : t.tipo === "TURNO" ? "actual" : t.tipo;
                        return (
                          <td key={d} className={`border-b border-line px-1.5 py-2 ${d === hoy ? "bg-brand-soft/40" : ""}`}>
                            <CeldaTurno nombre={`${nombre}, ${d}`} valor={valor} opciones={opciones} color={t?.color ?? null} accion={asignarAccion.bind(null, p.id, d)} />
                          </td>
                        );
                      })}
                      <td className="border-b border-line px-3 py-2 text-right tabular-nums text-muted">{horasTexto(minutosTrabajados(suyos))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky left-0 bg-surface px-4 py-2 text-xs text-muted">En turno</td>
                  {enTurnoPorDia.map((n, i) => <td key={dias[i]} className="px-3 py-2 text-xs text-muted">{n}</td>)}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <Card className="mt-4 text-xs text-muted">
            Elige en cada casilla el turno, un descanso o una ausencia; se guarda al instante. Un cambio en un turno tipo (Turnos) no mueve lo que ya asignaste.
          </Card>
        </>
      )}
    </>
  );
}
