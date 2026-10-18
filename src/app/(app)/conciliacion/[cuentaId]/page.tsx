import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero, hoyIso } from "@/lib/fechas";
import { saldoCuenta } from "@/lib/finanzas/servicio";
import { MES_RE } from "@/lib/conciliacion/cierre";
import { cuadreDelMes, pendientesConSugerencias, saldoSugeridoDelBanco } from "@/lib/conciliacion/servicio";
import { mesDe, type Mapeo } from "@/lib/conciliacion/importar";
import { Campo, Card, Input, Insignia, PageHeader, Select, Tabla, Td, Textarea, Th, Vacio, BotonLink } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { ImportarEstadoCuenta } from "@/components/importar-estado-cuenta";
import { cerrarMesAccion, conciliarAccion, desconciliarAccion, importarAccion, reabrirMesAccion, restaurarAccion } from "../actions";

export const maxDuration = 120;
const VISTAS = { pendientes: "Por conciliar", conciliados: "Conciliados", sinpareja: "Sin pareja", cierres: "Cierres" } as const;
type Vista = keyof typeof VISTAS;

export default async function CuentaConciliacionPage({ params, searchParams }: { params: Promise<{ cuentaId: string }>; searchParams: Promise<{ ver?: string; mes?: string; saldo?: string }> }) {
  const { cuentaId } = await params;
  const q = await searchParams;
  const s = await requireModulo("conciliacion", "conciliacion:administrar");
  const ver: Vista = q.ver && q.ver in VISTAS ? (q.ver as Vista) : "pendientes";

  const d = await withTenant(s.tenantId, async (tx) => {
    const cuenta = await tx.cuenta.findUnique({ where: { id: cuentaId } });
    if (!cuenta || cuenta.tipo === "EFECTIVO") return null;
    const saldo = await saldoCuenta(tx, cuentaId);
    const cierres = await tx.cierreConciliacion.findMany({ where: { cuentaId }, orderBy: { mes: "desc" } });
    const cuentasCount = await tx.movimientoBanco.groupBy({ by: ["estado"], where: { cuentaId }, _count: { _all: true } });
    const cuenta_n = (e: string) => cuentasCount.find((c) => c.estado === e)?._count._all ?? 0;
    const base = { cuenta, saldo, cierres, n: { PENDIENTE: cuenta_n("PENDIENTE"), CONCILIADA: cuenta_n("CONCILIADA"), IGNORADA: cuenta_n("IGNORADA") } };
    if (ver === "pendientes") {
      const p = await pendientesConSugerencias(tx, cuentaId);
      const categorias = await tx.categoria.findMany({ where: { activa: true }, orderBy: [{ tipo: "asc" }, { nombre: "asc" }] });
      return { ...base, p, categorias };
    }
    if (ver === "conciliados") {
      const lineas = await tx.movimientoBanco.findMany({ where: { cuentaId, estado: "CONCILIADA" }, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 150, include: { gasto: true, ingreso: true, traspaso: true } });
      return { ...base, lineas };
    }
    if (ver === "sinpareja") {
      return { ...base, lineas: await tx.movimientoBanco.findMany({ where: { cuentaId, estado: "IGNORADA" }, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 150 }) };
    }
    // Cierres: el mes por defecto es el primero con movimientos que aún no se ha cerrado y ya terminó
    const cerrados = new Set(cierres.map((c) => c.mes));
    const hoyMes = hoyIso().slice(0, 7);
    const meses = (await tx.movimientoBanco.findMany({ where: { cuentaId }, select: { fecha: true }, distinct: ["fecha"], orderBy: { fecha: "asc" } })).map((l) => mesDe(aIso(l.fecha)));
    const mes = q.mes && MES_RE.test(q.mes) ? q.mes : (meses.find((m) => m < hoyMes && !cerrados.has(m)) ?? null);
    let cuadre = null, sugerido: number | null = null, saldoBanco: number | null = null;
    if (mes) {
      sugerido = await saldoSugeridoDelBanco(tx, cuentaId, mes);
      const cierre = cierres.find((c) => c.mes === mes);
      const texto = q.saldo?.trim();
      if (cierre) saldoBanco = cierre.saldoBancoCentavos;
      else if (texto && /^-?[\d.,]+$/.test(texto.replace(/[$\s]/g, ""))) {
        const neg = texto.startsWith("-"), n = Number(texto.replace(/[-$,\s]/g, ""));
        if (Number.isFinite(n)) saldoBanco = Math.round(n * 100) * (neg ? -1 : 1);
      }
      if (saldoBanco !== null) cuadre = await cuadreDelMes(tx, cuentaId, mes, saldoBanco);
    }
    return { ...base, mes, cuadre, sugerido, saldoBanco };
  });
  if (!d) notFound();
  const { cuenta: c, saldo, cierres, n } = d;
  const cerrados = new Set(cierres.map((x) => x.mes));
  const mapeoGuardado = (c.mapeoBanco ?? null) as Mapeo | null;
  const href = (v: Vista) => `/conciliacion/${cuentaId}?ver=${v}`;

  return (
    <>
      <Link href="/conciliacion" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Conciliación</Link>
      <PageHeader titulo={c.nombre} sub={`Saldo en el sistema ${dinero(saldo, c.moneda)} · ${c.moneda}`} />

      <details className="mb-6 rounded-xl border border-line bg-surface p-4" open={n.PENDIENTE + n.CONCILIADA + n.IGNORADA === 0}>
        <summary className="cursor-pointer font-semibold">Importar estado de cuenta</summary>
        <div className="mt-4"><ImportarEstadoCuenta accion={importarAccion.bind(null, cuentaId)} mapeoGuardado={mapeoGuardado} moneda={c.moneda} /></div>
      </details>

      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {(Object.keys(VISTAS) as Vista[]).map((v) => {
          const cuenta = v === "pendientes" ? n.PENDIENTE : v === "conciliados" ? n.CONCILIADA : v === "sinpareja" ? n.IGNORADA : cierres.length;
          return <Link key={v} href={href(v)} className={`rounded-full border px-3 py-1 ${ver === v ? "border-brand bg-brand-soft font-medium" : "border-line"}`}>{VISTAS[v]} ({cuenta})</Link>;
        })}
      </nav>

      {ver === "pendientes" && "p" in d && (
        d.p.lineas.length === 0 ? <Vacio>No hay movimientos del banco por conciliar. Importa un estado de cuenta arriba.</Vacio> : (
          <Formulario accion={conciliarAccion.bind(null, cuentaId)} enviar="Aplicar selección">
            <p className="text-sm text-muted">El sistema propone la pareja con el mismo importe y fecha cercana. Revisa, cambia lo que haga falta y aplica. {d.p.total > d.p.lineas.length && `Se muestran los primeros ${d.p.lineas.length} de ${d.p.total}; al aplicar aparecen los siguientes.`}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Categoría de los gastos que se creen">
                <Select name="categoriaGasto"><option value="">Sin categoría</option>{d.categorias.filter((x) => x.tipo === "GASTO").map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select>
              </Campo>
              <Campo etiqueta="Categoría de los ingresos que se creen">
                <Select name="categoriaIngreso"><option value="">Sin categoría</option>{d.categorias.filter((x) => x.tipo === "INGRESO").map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Select>
              </Campo>
            </div>
            <Tabla>
              <thead><tr><Th>Fecha</Th><Th>Banco</Th><Th>Importe</Th><Th>Conciliar con</Th></tr></thead>
              <tbody>
                {d.p.lineas.map((l) => {
                  const sug = d.p.sugerencias.get(l.id);
                  const porClave = new Map(d.p.candidatos.map((x) => [x.clave, x]));
                  const cerrado = cerrados.has(mesDe(aIso(l.fecha)));
                  return (
                    <tr key={l.id}>
                      <Td className="whitespace-nowrap">{aIso(l.fecha)}</Td>
                      <Td>{l.descripcion}{l.referencia && <span className="block text-xs text-muted">Ref. {l.referencia}</span>}</Td>
                      <Td className={`whitespace-nowrap font-medium ${l.montoCentavos < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>{dinero(l.montoCentavos, c.moneda)}</Td>
                      <Td>
                        <Select name={`m_${l.id}`} defaultValue={sug?.elegida ?? ""} disabled={cerrado}>
                          <option value="">— decidir después —</option>
                          {sug?.opciones.map((o) => {
                            const m = porClave.get(o.clave)!;
                            return <option key={o.clave} value={o.clave}>{m.fecha} · {m.texto || "Sin concepto"} · {dinero(m.montoCentavos, c.moneda)}</option>;
                          })}
                          <option value="nuevo">{l.montoCentavos < 0 ? "Crear gasto con este movimiento" : "Crear ingreso con este movimiento"}</option>
                          <option value="ignorar">Dejar sin pareja</option>
                        </Select>
                        {sug?.elegida && !sug.segura && <Insignia tono="ambar">Revisar: hay varias opciones</Insignia>}
                        {!sug?.opciones.length && <span className="mt-1 block text-xs text-muted">Nada en el sistema con ese importe cerca de esa fecha.</span>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          </Formulario>
        )
      )}

      {ver === "conciliados" && "lineas" in d && (
        d.lineas.length === 0 ? <Vacio>Aún no hay movimientos conciliados.</Vacio> : (
          <Tabla>
            <thead><tr><Th>Fecha</Th><Th>Banco</Th><Th>Importe</Th><Th>Conciliado con</Th><Th /></tr></thead>
            <tbody>
              {d.lineas.map((l) => {
                const v = l as typeof l & { gasto?: { id: string; concepto: string } | null; ingreso?: { concepto: string } | null; traspaso?: object | null };
                const g = v.gasto, i = v.ingreso, t = v.traspaso;
                return (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap">{aIso(l.fecha)}</Td><Td>{l.descripcion}</Td><Td className="whitespace-nowrap">{dinero(l.montoCentavos, c.moneda)}</Td>
                    <Td className="text-xs">{g ? <>Gasto · <Link href={`/gastos/${g.id}`} className="text-brand">{g.concepto}</Link></> : i ? `Ingreso · ${i.concepto}` : t ? "Traspaso entre cuentas" : "—"}</Td>
                    <Td>{cerrados.has(mesDe(aIso(l.fecha))) ? <Insignia>Mes cerrado</Insignia> : <BotonAccion etiqueta="Desconciliar" accion={desconciliarAccion.bind(null, l.id)} confirmar="¿Quitar esta conciliación?" />}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )
      )}

      {ver === "sinpareja" && "lineas" in d && (
        d.lineas.length === 0 ? <Vacio>No hay movimientos marcados sin pareja.</Vacio> : (
          <>
            <p className="mb-3 text-sm text-muted">Son movimientos reales del banco que no corresponden a nada del sistema. Siguen explicando la diferencia del cierre mensual.</p>
            <Tabla>
              <thead><tr><Th>Fecha</Th><Th>Banco</Th><Th>Importe</Th><Th /></tr></thead>
              <tbody>
                {d.lineas.map((l) => (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap">{aIso(l.fecha)}</Td><Td>{l.descripcion}</Td><Td className="whitespace-nowrap">{dinero(l.montoCentavos, c.moneda)}</Td>
                    <Td>{cerrados.has(mesDe(aIso(l.fecha))) ? <Insignia>Mes cerrado</Insignia> : <BotonAccion etiqueta="Volver a conciliar" accion={restaurarAccion.bind(null, l.id)} />}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </>
        )
      )}

      {ver === "cierres" && "mes" in d && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <h2 className="mb-1 font-semibold">Cuadre del mes</h2>
            <p className="mb-3 text-xs text-muted">Escribe el saldo final que marca el estado de cuenta del banco al último día del mes.</p>
            <form method="get" className="space-y-3">
              <input type="hidden" name="ver" value="cierres" />
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Mes"><Input type="month" name="mes" defaultValue={d.mes ?? ""} required /></Campo>
                <Campo etiqueta={`Saldo final del banco (${c.moneda})`} ayuda={d.sugerido !== null && d.sugerido !== undefined ? `El archivo indica ${dinero(d.sugerido, c.moneda)}` : undefined}>
                  <Input name="saldo" inputMode="decimal" defaultValue={d.saldoBanco !== null ? String(d.saldoBanco / 100) : d.sugerido !== null && d.sugerido !== undefined ? String(d.sugerido / 100) : ""} required />
                </Campo>
              </div>
              <button className="rounded-lg border border-line px-3 py-1.5 text-sm">Calcular cuadre</button>
            </form>
            {d.cuadre && (
              <div className="mt-5 space-y-2 text-sm">
                <p className="flex justify-between"><span>Saldo del banco</span><strong>{dinero(d.cuadre.saldoBancoCentavos, c.moneda)}</strong></p>
                <p className="flex justify-between"><span>Saldo en el sistema (al {d.cuadre.fin})</span><strong>{dinero(d.cuadre.saldoSistemaCentavos, c.moneda)}</strong></p>
                <p className="flex justify-between border-t border-line pt-2"><span>Diferencia</span><strong>{dinero(d.cuadre.diferencia, c.moneda)}</strong></p>
                <p className="flex justify-between"><span>Explicada por lo no conciliado</span><span>{dinero(d.cuadre.explicada, c.moneda)}</span></p>
                <p className="flex justify-between"><span>Sin explicar</span>{d.cuadre.sinExplicar === 0 ? <Insignia tono="verde">Cuadra</Insignia> : <strong className="text-red-700 dark:text-red-300">{dinero(d.cuadre.sinExplicar, c.moneda)}</strong>}</p>
                <p className="text-xs text-muted">En el banco y no en el sistema: {d.cuadre.soloBanco.length} · En el sistema y no en el banco: {d.cuadre.soloSistema.length}{d.cuadre.pendientes > 0 && ` · ${d.cuadre.pendientes} del banco siguen por conciliar`}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <BotonLink href={`/conciliacion/${cuentaId}/reporte?mes=${d.cuadre.mes}&saldo=${d.cuadre.saldoBancoCentavos / 100}`} variante="suave">Ver reporte de diferencias</BotonLink>
                  <BotonLink href={`/conciliacion/${cuentaId}/exportar?mes=${d.cuadre.mes}&saldo=${d.cuadre.saldoBancoCentavos / 100}`} variante="suave">Descargar CSV</BotonLink>
                </div>
                {!cerrados.has(d.cuadre.mes) && (
                  <Formulario accion={cerrarMesAccion.bind(null, cuentaId)} enviar={`Cerrar ${d.cuadre.mes}`} className="space-y-3 border-t border-line pt-4">
                    <input type="hidden" name="mes" value={d.cuadre.mes} />
                    <input type="hidden" name="saldoBanco" value={String(d.cuadre.saldoBancoCentavos / 100)} />
                    <Campo etiqueta="Notas del cierre" ayuda={d.cuadre.sinExplicar !== 0 ? "Obligatorio: queda una diferencia sin explicar" : undefined}><Textarea name="notas" /></Campo>
                  </Formulario>
                )}
              </div>
            )}
            {!d.cuadre && <p className="mt-4 text-sm text-muted">{d.mes ? "Escribe el saldo del banco y calcula el cuadre." : "No hay meses por cerrar. Importa un estado de cuenta primero."}</p>}
          </Card>
          <div>
            <h2 className="mb-3 font-semibold">Meses cerrados</h2>
            {cierres.length === 0 ? <Vacio>Aún no has cerrado ningún mes.</Vacio> : (
              <Tabla>
                <thead><tr><Th>Mes</Th><Th>Banco</Th><Th>Sin explicar</Th><Th /></tr></thead>
                <tbody>
                  {cierres.map((x, idx) => (
                    <tr key={x.id}>
                      <Td><Link href={`/conciliacion/${cuentaId}/reporte?mes=${x.mes}`} className="text-brand">{x.mes}</Link>{x.notas && <span className="block text-xs text-muted">{x.notas}</span>}</Td>
                      <Td>{dinero(x.saldoBancoCentavos, c.moneda)}</Td>
                      <Td>{x.sinExplicarCentavos === 0 ? <Insignia tono="verde">Cuadra</Insignia> : dinero(x.sinExplicarCentavos, c.moneda)}</Td>
                      <Td>{idx === 0 && <BotonAccion etiqueta="Reabrir" accion={reabrirMesAccion.bind(null, cuentaId, x.mes)} confirmar={`¿Reabrir ${x.mes}? Sus movimientos podrán modificarse de nuevo.`} />}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )}
          </div>
        </div>
      )}
    </>
  );
}
