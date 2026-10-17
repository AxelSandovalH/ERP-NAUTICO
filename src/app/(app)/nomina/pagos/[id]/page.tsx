import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero, hoyIso } from "@/lib/fechas";
import { clasificarDias, type EstadoDia } from "@/lib/nomina/calculo";
import { diasEntre } from "@/lib/nomina/periodos";
import { ESQUEMAS_PAGO, ESTADOS_DIA, ESTADOS_PAGO_NOMINA, METODOS_PAGO } from "@/lib/etiquetas";
import { Campo, Card, Input, Insignia, PageHeader, Select, Tabla, Td, Th } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { agregarConceptoAccion, cancelarPagoAccion, marcarPagadoAccion, quitarConceptoAccion, recalcularPagoAccion } from "../../actions";

const FECHA_CORTA = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function PagoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("nomina", "nomina:administrar");
  const { p, entradas, manuales } = await withTenant(s.tenantId, async (tx) => {
    const p = await tx.pagoNomina.findUnique({ where: { id }, include: { empleado: true, conceptos: { orderBy: [{ tipo: "asc" }, { automatico: "desc" }] } } });
    if (!p) return { p: null, entradas: [], manuales: [] };
    const rango = { gte: p.periodoInicio, lte: p.periodoFin };
    return {
      p,
      entradas: await tx.checada.findMany({ where: { empleadoId: p.empleadoId, tipo: "ENTRADA", dia: rango }, select: { dia: true } }),
      manuales: await tx.diaAsistencia.findMany({ where: { empleadoId: p.empleadoId, fecha: rango } }),
    };
  });
  if (!p) notFound();
  const pendiente = p.estado === "PENDIENTE";
  const hoy = hoyIso(s.zonaHoraria);
  const dias = clasificarDias(
    diasEntre(aIso(p.periodoInicio), aIso(p.periodoFin)), new Set(entradas.map((c) => aIso(c.dia))),
    new Map<string, EstadoDia>(manuales.map((m) => [aIso(m.fecha), m.estado])));

  return (
    <>
      <Link href={`/nomina?fecha=${aIso(p.periodoInicio)}&p=${p.empleado.periodicidad}`} className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Nómina</Link>
      <PageHeader titulo={`${p.empleado.nombre} ${p.empleado.apellido}`} sub={`${aIso(p.periodoInicio)} → ${aIso(p.periodoFin)} · ${ESQUEMAS_PAGO[p.esquema]}`}
        acciones={<Insignia tono={p.estado === "PAGADO" ? "verde" : p.estado === "CANCELADO" ? "rojo" : "ambar"}>{ESTADOS_PAGO_NOMINA[p.estado]}</Insignia>} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">Cálculo</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
              <dt className="text-muted">{p.esquema === "POR_DIA" ? `${p.diasTrabajados} días × ${dinero(p.sueldoCentavos, s.moneda)}` : "Sueldo del periodo"}</dt><dd>{dinero(p.brutoCentavos, s.moneda)}</dd>
              {p.conceptos.map((c) => (
                <div key={c.id} className="contents">
                  <dt className="flex items-center gap-2 text-muted">
                    {c.concepto}{c.automatico && <Insignia>auto</Insignia>}
                    {pendiente && !c.automatico && <BotonAccion etiqueta="Quitar" variante="peligro" accion={quitarConceptoAccion.bind(null, c.id)} />}
                  </dt>
                  <dd className={c.tipo === "BONO" ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>{c.tipo === "BONO" ? "+" : "−"}{dinero(c.montoCentavos, s.moneda)}</dd>
                </div>
              ))}
              <dt className="border-t border-line pt-2 font-semibold">Neto a pagar</dt><dd className="border-t border-line pt-2 text-lg font-semibold">{dinero(p.netoCentavos, s.moneda)}</dd>
            </dl>
            {p.estado === "PAGADO" && <p className="mt-3 text-xs text-muted">Pagado {p.pagadoEn?.toISOString().slice(0, 10)} · {p.metodo ? METODOS_PAGO[p.metodo] : ""}{p.referencia ? ` · ${p.referencia}` : ""}</p>}
            {p.diasSinRegistro > 0 && p.estado !== "CANCELADO" && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {p.diasSinRegistro} {p.diasSinRegistro === 1 ? "día" : "días"} sin checada ni corrección.{p.esquema === "POR_DIA" ? " No se pagan." : " No descuentan."} Corrígelos en Asistencia si trabajó.
              </p>
            )}
          </Card>

          {pendiente && (
            <>
              <Card>
                <h2 className="mb-4 font-semibold">Agregar bono o deducción</h2>
                <Formulario accion={agregarConceptoAccion.bind(null, p.id)} enviar="Agregar" className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Tipo"><Select name="tipo" defaultValue="BONO"><option value="BONO">Bono</option><option value="DEDUCCION">Deducción</option></Select></Campo>
                  <Campo etiqueta="Monto"><Input name="monto" inputMode="decimal" required /></Campo>
                  <Campo etiqueta="Concepto" className="sm:col-span-2"><Input name="concepto" placeholder="Puntualidad, IMSS, anticipo…" required /></Campo>
                </Formulario>
              </Card>
              <Card>
                <h2 className="mb-1 font-semibold">Pagar</h2>
                <p className="mb-3 text-xs text-muted">Antes de pagar se recalcula con la asistencia de este momento, para no pagar cifras viejas.</p>
                <Formulario accion={marcarPagadoAccion.bind(null, p.id)} enviar="Marcar como pagado" className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Método"><Select name="metodo" defaultValue="TRANSFERENCIA">{Object.entries(METODOS_PAGO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Campo>
                  <Campo etiqueta="Referencia"><Input name="referencia" placeholder="Folio de transferencia" /></Campo>
                </Formulario>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Formulario accion={recalcularPagoAccion.bind(null, p.id)} enviar="Recalcular" variante="suave" className="inline"><span /></Formulario>
                </div>
              </Card>
            </>
          )}
          {p.estado !== "CANCELADO" && (
            <BotonAccion etiqueta={p.estado === "PAGADO" ? "Cancelar pago (ya pagado)" : "Cancelar pago"} variante="peligro"
              confirmar={p.estado === "PAGADO" ? "Este pago ya está marcado como pagado. ¿Cancelarlo de todos modos?" : "¿Cancelar este pago?"} accion={cancelarPagoAccion.bind(null, p.id)} />
          )}
        </div>

        <Card>
          <h2 className="mb-1 font-semibold">Asistencia del periodo</h2>
          <p className="mb-3 text-xs text-muted">{p.diasTrabajados} trabajados · {p.diasFalta} {p.diasFalta === 1 ? "falta" : "faltas"} · {p.diasSinRegistro} sin registro · {p.diasPeriodo} días</p>
          <Tabla>
            <thead><tr><Th>Día</Th><Th>Estado</Th><Th>Origen</Th></tr></thead>
            <tbody>
              {dias.map((d) => (
                <tr key={d.fecha}>
                  <Td className="whitespace-nowrap">{FECHA_CORTA.format(new Date(`${d.fecha}T00:00:00Z`))}</Td>
                  <Td>{d.estado === "SIN_REGISTRO" ? (d.fecha >= hoy ? <span className="text-muted">{d.fecha === hoy ? "Hoy" : "Por venir"}</span> : <span className="text-amber-700 dark:text-amber-300">Sin registro</span>) : ESTADOS_DIA[d.estado]}</Td>
                  <Td className="text-xs text-muted">{d.origen === "checada" ? "Checada" : d.origen === "manual" ? "Corregido" : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Card>
      </div>
    </>
  );
}
