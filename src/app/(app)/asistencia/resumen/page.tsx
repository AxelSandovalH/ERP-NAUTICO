import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, aIso, esIso, hoyIso } from "@/lib/fechas";
import { clasificarDias, contar, type EstadoDia } from "@/lib/nomina/calculo";
import { diasEntre, periodoAnterior, periodoDe, periodoSiguiente, type Periodicidad } from "@/lib/nomina/periodos";
import { PERIODICIDADES, SIMBOLO_DIA } from "@/lib/etiquetas";
import { BotonLink, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";

export const metadata = { title: "Resumen de asistencia · FleetNautic" };

const COLOR: Record<string, string> = {
  TRABAJO: "text-emerald-600", VACACIONES: "text-sky-600", FALTA: "text-red-600 font-bold", PERMISO: "text-amber-600",
  INCAPACIDAD: "text-purple-600", DESCANSO: "text-muted", SIN_REGISTRO: "text-muted/50",
};

export default async function ResumenPage({ searchParams }: { searchParams: Promise<{ p?: string; fecha?: string }> }) {
  const sp = await searchParams;
  const s = await requireModulo("asistencia", "asistencia:administrar");
  const per: Periodicidad = sp.p && sp.p in PERIODICIDADES ? (sp.p as Periodicidad) : "QUINCENAL";
  const periodo = periodoDe(per, esIso(sp.fecha) ? sp.fecha : hoyIso(s.zonaHoraria));
  const dias = diasEntre(periodo.inicio, periodo.fin);
  const hoy = hoyIso(s.zonaHoraria);

  const filas = await withTenant(s.tenantId, async (tx) => {
    const empleados = await tx.empleado.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
    const entradas = await tx.checada.findMany({ where: { tipo: "ENTRADA", dia: { gte: aDate(periodo.inicio), lte: aDate(periodo.fin) } }, select: { empleadoId: true, dia: true } });
    const manuales = await tx.diaAsistencia.findMany({ where: { fecha: { gte: aDate(periodo.inicio), lte: aDate(periodo.fin) } } });
    return empleados.map((e) => {
      const cl = clasificarDias(dias,
        new Set(entradas.filter((c) => c.empleadoId === e.id).map((c) => aIso(c.dia))),
        new Map<string, EstadoDia>(manuales.filter((m) => m.empleadoId === e.id).map((m) => [aIso(m.fecha), m.estado])));
      return { e, cl, c: contar(cl, hoy) };
    });
  });
  const enlace = (p: Periodicidad, fecha: string) => `/asistencia/resumen?p=${p}&fecha=${fecha}`;
  return (
    <>
      <Link href="/asistencia" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Asistencia</Link>
      <PageHeader titulo="Resumen de asistencia" sub={periodo.etiqueta}
        acciones={<>
          <BotonLink variante="suave" href={enlace(per, periodoAnterior(per, periodo).inicio)}>←</BotonLink>
          <BotonLink variante="suave" href={enlace(per, hoyIso(s.zonaHoraria))}>Actual</BotonLink>
          <BotonLink variante="suave" href={enlace(per, periodoSiguiente(per, periodo).inicio)}>→</BotonLink>
        </>} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {Object.entries(PERIODICIDADES).map(([k, l]) => (
          <Link key={k} href={enlace(k as Periodicidad, periodo.inicio)} className={`rounded-full border px-3 py-1 ${k === per ? "border-brand bg-brand-soft font-medium text-brand" : "border-line"}`}>{l}</Link>
        ))}
        <span className="ml-2 text-xs text-muted">✓ trabajó · V vacaciones · D descanso · I incapacidad · P permiso sin goce · F falta · · sin registro</span>
      </div>
      {filas.length === 0 ? <Vacio>No hay empleados activos.</Vacio> : (
        <Tabla>
          <thead>
            <tr>
              <Th>Empleado</Th>
              {dias.map((d) => <Th key={d} className="px-1 text-center">{Number(d.slice(8))}</Th>)}
              <Th>Trab.</Th><Th>Faltas</Th><Th>Sin reg.</Th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ e, cl, c }) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap font-medium">{e.nombre} {e.apellido}</Td>
                {cl.map((d) => {
                  const porVenir = d.estado === "SIN_REGISTRO" && d.fecha >= hoy; // hoy aún puede checar
                  return <Td key={d.fecha} className={`px-1 text-center ${porVenir ? "text-muted/30" : COLOR[d.estado]}`} title={`${d.fecha}: ${porVenir ? "por venir" : d.estado}${d.origen === "manual" ? " (corregido)" : ""}`}>{porVenir ? "" : SIMBOLO_DIA[d.estado]}</Td>;
                })}
                <Td className="text-center font-semibold">{c.trabajados}</Td>
                <Td className="text-center">{c.falta || "—"}</Td>
                <Td className="text-center">{c.sinRegistro || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
