import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero, hoyIso } from "@/lib/fechas";
import { saldosPorCuenta } from "@/lib/finanzas/servicio";
import { TIPOS_CUENTA } from "@/lib/etiquetas";
import { Campo, Card, Input, Insignia, PageHeader, Select, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { CamposCuenta } from "@/components/form-cuenta";
import { arqueoAccion, cancelarTraspasoAccion, crearTraspasoAccion, guardarCuenta } from "../actions";

type Mov = { clave: string; fecha: string; creado: number; tipo: string; tono: "verde" | "rojo" | "azul" | "ambar" | "gris"; texto: string; delta: number; cancelado: boolean; extra?: React.ReactNode };

export default async function CuentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("cuentas", "cuentas:administrar");
  const datos = await withTenant(s.tenantId, async (tx) => {
    const cuenta = await tx.cuenta.findUnique({ where: { id } });
    if (!cuenta) return null;
    const saldo = (await saldosPorCuenta(tx)).find((x) => x.cuenta.id === id)!.saldoCentavos;
    const gastos = await tx.gasto.findMany({ where: { cuentaId: id }, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 80 });
    const ingresos = await tx.ingreso.findMany({ where: { cuentaId: id }, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 80 });
    const traspasos = await tx.traspaso.findMany({ where: { OR: [{ origenId: id }, { destinoId: id }] }, include: { origen: true, destino: true }, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 80 });
    const ajustes = await tx.ajusteCuenta.findMany({ where: { cuentaId: id }, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 40 });
    const arqueos = cuenta.tipo === "EFECTIVO" ? await tx.arqueoCuenta.findMany({ where: { cuentaId: id }, orderBy: { fecha: "desc" }, take: 10 }) : [];
    const otras = await tx.cuenta.findMany({ where: { activa: true, id: { not: id } }, orderBy: { nombre: "asc" } });
    return { cuenta, saldo, gastos, ingresos, traspasos, ajustes, arqueos, otras };
  });
  if (!datos) notFound();
  const { cuenta: c, saldo, gastos, ingresos, traspasos, ajustes, arqueos, otras } = datos;

  const movs: Mov[] = [
    ...gastos.map((g): Mov => ({ clave: `g${g.id}`, fecha: aIso(g.fecha), creado: g.creadoEn.getTime(), tipo: "Gasto", tono: "rojo", texto: g.concepto, delta: -g.montoCentavos, cancelado: g.estado === "CANCELADO", extra: <Link href={`/gastos/${g.id}`} className="text-xs text-brand">ver</Link> })),
    ...ingresos.map((i): Mov => ({ clave: `i${i.id}`, fecha: aIso(i.fecha), creado: i.creadoEn.getTime(), tipo: "Ingreso", tono: "verde", texto: i.concepto, delta: i.montoCentavos, cancelado: i.estado === "CANCELADO" })),
    ...traspasos.map((t): Mov => {
      const sale = t.origenId === id;
      return { clave: `t${t.id}`, fecha: aIso(t.fecha), creado: t.creadoEn.getTime(), tipo: "Traspaso", tono: "azul", texto: sale ? `A ${t.destino.nombre}` : `De ${t.origen.nombre}`, delta: sale ? -t.montoOrigenCentavos : t.montoDestinoCentavos, cancelado: t.estado === "CANCELADO",
        extra: t.estado === "ACTIVO" ? <BotonAccion etiqueta="Cancelar" variante="peligro" confirmar="¿Cancelar este traspaso?" accion={cancelarTraspasoAccion.bind(null, t.id)} /> : undefined };
    }),
    ...ajustes.map((a): Mov => ({ clave: `a${a.id}`, fecha: aIso(a.fecha), creado: a.creadoEn.getTime(), tipo: "Ajuste", tono: "ambar", texto: a.motivo, delta: a.montoCentavos, cancelado: false })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.creado - a.creado)).slice(0, 100);

  return (
    <>
      <Link href="/cuentas" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Cuentas</Link>
      <PageHeader titulo={c.nombre} sub={`${TIPOS_CUENTA[c.tipo]} · ${c.moneda}`} acciones={<span className="text-2xl font-semibold">{dinero(saldo, c.moneda)}</span>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-semibold">Datos</h2>
            <Formulario accion={guardarCuenta.bind(null, c.id)}><CamposCuenta v={c} conActiva /></Formulario>
          </Card>
          {c.tipo === "EFECTIVO" && (
            <Card>
              <h2 className="mb-1 font-semibold">Arqueo de caja</h2>
              <p className="mb-3 text-xs text-muted">Cuenta el efectivo físico. El sistema lo compara con el saldo de arriba y registra la diferencia como ajuste.</p>
              <Formulario accion={arqueoAccion.bind(null, c.id)} enviar="Registrar arqueo" className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta={`Efectivo contado (${c.moneda})`}><Input name="contado" inputMode="decimal" required /></Campo>
                <Campo etiqueta="Notas"><Input name="notas" /></Campo>
              </Formulario>
              {arqueos.length > 0 && (
                <div className="mt-4">
                  <Tabla>
                    <thead><tr><Th>Fecha</Th><Th>Sistema</Th><Th>Contado</Th><Th>Diferencia</Th></tr></thead>
                    <tbody>
                      {arqueos.map((a) => {
                        const d = a.contadoCentavos - a.teoricoCentavos;
                        return (
                          <tr key={a.id}>
                            <Td>{aIso(a.fecha)}</Td><Td>{dinero(a.teoricoCentavos, c.moneda)}</Td><Td>{dinero(a.contadoCentavos, c.moneda)}</Td>
                            <Td>{d === 0 ? <Insignia tono="verde">Cuadra</Insignia> : <span className={d > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>{d > 0 ? "+" : "−"}{dinero(Math.abs(d), c.moneda)}</span>}</Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Tabla>
                </div>
              )}
            </Card>
          )}
          {otras.length > 0 && c.activa && (
            <Card>
              <h2 className="mb-1 font-semibold">Traspaso desde esta cuenta</h2>
              <p className="mb-3 text-xs text-muted">Mover dinero entre tus cuentas no es gasto ni ingreso. Si cambia la moneda, indica cuánto se recibió.</p>
              <Formulario accion={crearTraspasoAccion} enviar="Registrar traspaso" className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="origenId" value={c.id} />
                <Campo etiqueta="Cuenta destino"><Select name="destinoId" defaultValue="" required><option value="" disabled>Elegir…</option>{otras.map((o) => <option key={o.id} value={o.id}>{o.nombre} ({o.moneda})</option>)}</Select></Campo>
                <Campo etiqueta="Fecha"><Input name="fecha" type="date" defaultValue={hoyIso(s.zonaHoraria)} required /></Campo>
                <Campo etiqueta={`Monto que sale (${c.moneda})`}><Input name="monto" inputMode="decimal" required /></Campo>
                <Campo etiqueta="Monto recibido" ayuda="Solo si la otra cuenta es de distinta moneda"><Input name="montoDestino" inputMode="decimal" /></Campo>
                <Campo etiqueta="Notas" className="sm:col-span-2"><Input name="notas" /></Campo>
              </Formulario>
            </Card>
          )}
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Movimientos</h2>
          {movs.length === 0 ? <Vacio>Esta cuenta aún no tiene movimientos.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Fecha</Th><Th>Movimiento</Th><Th>Monto</Th></tr></thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.clave} className={m.cancelado ? "opacity-50" : ""}>
                    <Td className="whitespace-nowrap">{m.fecha}</Td>
                    <Td><Insignia tono={m.tono}>{m.tipo}</Insignia> <span className={m.cancelado ? "line-through" : ""}>{m.texto}</span> {m.cancelado && <Insignia>Cancelado</Insignia>} {m.extra}</Td>
                    <Td className={`whitespace-nowrap font-medium ${m.delta < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>{m.delta < 0 ? "−" : "+"}{dinero(Math.abs(m.delta), c.moneda)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>
      </div>
    </>
  );
}
