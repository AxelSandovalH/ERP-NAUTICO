import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, dinero, esIso, hoyIso } from "@/lib/fechas";
import { periodoAnterior, periodoDe, periodoSiguiente, type Periodicidad } from "@/lib/nomina/periodos";
import { ESTADOS_PAGO_NOMINA, PERIODICIDADES } from "@/lib/etiquetas";
import { BotonLink, Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { generarNominaAccion } from "./actions";

// Desde aquí se lanzan acciones masivas (generar nómina / recalcular comisiones)
export const maxDuration = 120;

export const metadata = { title: "Nómina · FleetNautic" };

export default async function NominaPage({ searchParams }: { searchParams: Promise<{ p?: string; fecha?: string }> }) {
  const sp = await searchParams;
  const s = await requireModulo("nomina", "nomina:administrar");
  const per: Periodicidad = sp.p && sp.p in PERIODICIDADES ? (sp.p as Periodicidad) : "QUINCENAL";
  const periodo = periodoDe(per, esIso(sp.fecha) ? sp.fecha : hoyIso(s.zonaHoraria));

  const { pagos, sinGenerar } = await withTenant(s.tenantId, async (tx) => {
    const pagos = await tx.pagoNomina.findMany({
      where: { periodoInicio: aDate(periodo.inicio), periodoFin: aDate(periodo.fin), estado: { not: "CANCELADO" }, empleado: { periodicidad: per } },
      include: { empleado: true }, orderBy: { empleado: { nombre: "asc" } },
    });
    const activos = await tx.empleado.count({ where: { activo: true, periodicidad: per } });
    return { pagos, sinGenerar: Math.max(0, activos - pagos.length) };
  });
  const suma = (f: (p: (typeof pagos)[number]) => number) => pagos.reduce((a, p) => a + f(p), 0);
  const pagado = suma((p) => (p.estado === "PAGADO" ? p.netoCentavos : 0));
  const pendiente = suma((p) => (p.estado === "PENDIENTE" ? p.netoCentavos : 0));
  const sinRegistro = pagos.filter((p) => p.estado === "PENDIENTE" && p.diasSinRegistro > 0 && p.esquema === "POR_DIA").length;
  const enlace = (p: Periodicidad, fecha: string) => `/nomina?p=${p}&fecha=${fecha}`;

  return (
    <>
      <PageHeader titulo="Nómina" sub={periodo.etiqueta}
        acciones={<>
          <BotonLink variante="suave" href={enlace(per, periodoAnterior(per, periodo).inicio)}>←</BotonLink>
          <BotonLink variante="suave" href={enlace(per, hoyIso(s.zonaHoraria))}>Actual</BotonLink>
          <BotonLink variante="suave" href={enlace(per, periodoSiguiente(per, periodo).inicio)}>→</BotonLink>
          <BotonLink href="/nomina/empleados">Empleados</BotonLink>
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {Object.entries(PERIODICIDADES).map(([k, l]) => (
          <Link key={k} href={enlace(k as Periodicidad, periodo.inicio)} className={`rounded-full border px-3 py-1 ${k === per ? "border-brand bg-brand-soft font-medium text-brand" : "border-line"}`}>{l}</Link>
        ))}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-muted">Pagos del periodo ({pagos.length})</p><p className="mt-1 text-2xl font-semibold">{dinero(pagado + pendiente, s.moneda)}</p></Card>
        <Card><p className="text-sm text-muted">Pagado</p><p className="mt-1 text-2xl font-semibold">{dinero(pagado, s.moneda)}</p></Card>
        <Card><p className="text-sm text-muted">Por pagar</p><p className="mt-1 text-2xl font-semibold">{dinero(pendiente, s.moneda)}</p></Card>
      </div>

      {sinRegistro > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {sinRegistro} empleados por día tienen días sin checada ni corrección: no se pagan. Revisa Asistencia → Resumen antes de pagar.
        </p>
      )}

      <Card className="mb-6">
        <Formulario accion={generarNominaAccion.bind(null, per, periodo.inicio)} enviar={pagos.length ? "Recalcular nómina del periodo" : "Generar nómina del periodo"} variante="suave" className="flex flex-wrap items-center gap-4">
          <p className="max-w-xl text-sm text-muted">
            Calcula el pago de cada empleado {PERIODICIDADES[per].toLowerCase()} activo con la asistencia actual. Los pagos pendientes se recalculan (conservando tus bonos y deducciones); los ya pagados no se tocan.
            {sinGenerar > 0 && <b className="text-foreground"> Faltan {sinGenerar} por generar.</b>}
          </p>
        </Formulario>
      </Card>

      {pagos.length === 0 ? <Vacio>Aún no hay pagos para este periodo. Genera la nómina para verlos.</Vacio> : (
        <Tabla>
          <thead><tr><Th>Empleado</Th><Th>Días</Th><Th>Bruto</Th><Th>Bonos</Th><Th>Deducciones</Th><Th>Neto</Th><Th>Estado</Th></tr></thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id} className="hover:bg-brand-soft/50">
                <Td><Link href={`/nomina/pagos/${p.id}`} className="font-medium text-brand">{p.empleado.nombre} {p.empleado.apellido}</Link></Td>
                <Td className="text-xs">{p.diasTrabajados} trab.{p.diasFalta > 0 && ` · ${p.diasFalta} falta${p.diasFalta === 1 ? "" : "s"}`}{p.diasSinRegistro > 0 && ` · ${p.diasSinRegistro} s/reg.`}</Td>
                <Td>{dinero(p.brutoCentavos, s.moneda)}</Td>
                <Td>{p.bonosCentavos ? dinero(p.bonosCentavos, s.moneda) : "—"}</Td>
                <Td>{p.deduccionesCentavos ? dinero(p.deduccionesCentavos, s.moneda) : "—"}</Td>
                <Td className="font-semibold">{dinero(p.netoCentavos, s.moneda)}</Td>
                <Td><Insignia tono={p.estado === "PAGADO" ? "verde" : "ambar"}>{ESTADOS_PAGO_NOMINA[p.estado]}</Insignia></Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
