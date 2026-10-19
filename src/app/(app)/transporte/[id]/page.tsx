import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero, fechaLarga, hoyIso } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { ESTADOS_TRASLADO, TIPOS_TRASLADO, TONO_TRASLADO } from "@/lib/transporte/horario";
import { resumenTraslado } from "@/lib/transporte/servicio";
import { ESTADOS_FACTURA, TONO_FACTURA } from "@/lib/facturacion/impuestos";
import { BotonLink, Campo, Card, Input, Insignia, PageHeader, Select, Tabla, Td, Th } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { CamposTraslado } from "@/components/transporte/form-traslado";
import { SubnavTransporte } from "@/components/transporte/subnav";
import { anularCobroAccion, cobroAccion, estadoAccion, gastoAccion, guardarTrasladoAccion } from "../actions";

export default async function TrasladoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("transporte", "transporte:ver");
  const gestionar = puede(s.rol, "transporte:gestionar"), conFinanzas = puede(s.rol, "transporte:finanzas");
  const conIngresos = s.modulos.includes("ingresos"), conGastos = s.modulos.includes("gastos");
  const conFacturacion = s.modulos.includes("facturacion") && puede(s.rol, "facturacion:ver");
  const d = await withTenant(s.tenantId, async (tx) => {
    const r = await resumenTraslado(tx, id);
    if (!r) return null;
    return {
      r,
      unidades: gestionar ? await tx.unidadTransporte.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } }) : [],
      choferes: gestionar ? await tx.empleado.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }) : [],
      cuentas: conFinanzas ? await tx.cuenta.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } }) : [],
      catIngreso: conFinanzas && conIngresos ? await tx.categoria.findMany({ where: { tipo: "INGRESO", activa: true }, orderBy: { nombre: "asc" } }) : [],
      facturas: conFacturacion ? await tx.facturaEmitida.findMany({ where: { trasladoId: id }, orderBy: { creadoEn: "desc" } }) : [],
      catGasto: conFinanzas && conGastos ? await tx.categoria.findMany({ where: { tipo: "GASTO", activa: true }, orderBy: { nombre: "asc" } }) : [],
    };
  });
  if (!d) notFound();
  const { traslado: t, gastos, gastosCentavos, resultadoCentavos } = d.r;
  const hoy = hoyIso(s.zonaHoraria);
  const cuentasBase = d.cuentas.filter((c) => c.moneda === s.moneda);
  const editable = gestionar && t.estado === "PROGRAMADO";
  const choferNombre = t.chofer ? `${t.chofer.nombre} ${t.chofer.apellido}`.trim() : null;
  const precio = t.precioCentavos ? (t.precioCentavos / 100).toFixed(2) : "";

  return (
    <>
      <Link href={`/transporte?fecha=${aIso(t.fecha)}`} className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Traslados del día</Link>
      <PageHeader
        titulo={`Traslado · ${minutosAHora(t.horaMin)}`} sub={`${fechaLarga(aIso(t.fecha))} · ${TIPOS_TRASLADO[t.tipo]}`}
        acciones={<Insignia tono={TONO_TRASLADO[t.estado]}>{ESTADOS_TRASLADO[t.estado]}</Insignia>}
      />
      <SubnavTransporte activo="/transporte" />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Datos del traslado</h2>
              <Link href={`/reservas/${t.reservaId}`} className="text-sm text-brand">Reserva #{t.reserva.folio} · {t.reserva.cliente.nombre}</Link>
            </div>
            {editable ? (
              <Formulario accion={guardarTrasladoAccion.bind(null, t.id)}>
                <CamposTraslado
                  reservaId={t.reservaId}
                  unidades={d.unidades.map((u) => ({ id: u.id, nombre: u.nombre, capacidad: u.capacidad }))}
                  choferes={d.choferes.map((c) => ({ id: c.id, nombre: `${c.nombre} ${c.apellido}`.trim() }))}
                  v={{ tipo: t.tipo, fecha: aIso(t.fecha), hora: minutosAHora(t.horaMin), duracion: t.duracionMin, origen: t.origen, destino: t.destino, pax: t.pax, unidadId: t.unidadId, choferId: t.choferId, precio, notas: t.notas }}
                />
              </Formulario>
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Recoger en</dt><dd>{t.origen}</dd></div>
                <div><dt className="text-muted">Llevar a</dt><dd>{t.destino}</dd></div>
                <div><dt className="text-muted">Pasajeros</dt><dd>{t.pax}</dd></div>
                <div><dt className="text-muted">Duración</dt><dd>{t.duracionMin} min</dd></div>
                <div><dt className="text-muted">Unidad</dt><dd>{t.unidad ? `${t.unidad.nombre}${t.unidad.placas ? ` · ${t.unidad.placas}` : ""}` : "Sin asignar"}</dd></div>
                <div><dt className="text-muted">Chofer</dt><dd>{choferNombre ?? "Sin asignar"}</dd></div>
                <div><dt className="text-muted">Precio</dt><dd>{t.precioCentavos ? dinero(t.precioCentavos, s.moneda) : "—"}</dd></div>
                {t.notas && <div className="sm:col-span-2"><dt className="text-muted">Notas</dt><dd>{t.notas}</dd></div>}
              </dl>
            )}
            {gestionar && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {t.estado === "PROGRAMADO" && <BotonAccion variante="primario" etiqueta="Marcar completado" accion={estadoAccion.bind(null, t.id, "COMPLETADO")} />}
                {t.estado === "PROGRAMADO" && <BotonAccion variante="peligro" etiqueta="Cancelar traslado" confirmar="¿Cancelar este traslado? Libera la unidad y el chofer." accion={estadoAccion.bind(null, t.id, "CANCELADO")} />}
                {t.estado !== "PROGRAMADO" && <BotonAccion etiqueta="Reprogramar" accion={estadoAccion.bind(null, t.id, "PROGRAMADO")} />}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {conFinanzas && conIngresos && (
            <Card>
              <h2 className="mb-1 font-semibold">Cobro</h2>
              <p className="mb-3 text-xs text-muted">Se cobra aparte de la reserva: no cambia su total ni sus comisiones.</p>
              {t.ingresoId ? (
                <div className="space-y-3 text-sm">
                  <p><Insignia tono="verde">Cobrado</Insignia> {dinero(t.precioCentavos, s.moneda)} registrados como ingreso.</p>
                  <BotonAccion variante="peligro" etiqueta="Anular cobro" confirmar="Se cancela el ingreso y el traslado vuelve a quedar por cobrar. ¿Continuar?" accion={anularCobroAccion.bind(null, t.id)} />
                </div>
              ) : t.precioCentavos <= 0 ? <p className="text-sm text-muted">Este traslado no tiene precio.</p> : t.estado === "CANCELADO" ? <p className="text-sm text-muted">El traslado está cancelado.</p> : cuentasBase.length === 0 ? (
                <p className="text-sm text-muted">Necesitas una cuenta en {s.moneda} para registrar el cobro.</p>
              ) : (
                <Formulario accion={cobroAccion.bind(null, t.id)} enviar={`Cobrar ${dinero(t.precioCentavos, s.moneda)}`}>
                  <div className="space-y-3">
                    <Campo etiqueta="Cuenta donde entra"><Select name="cuentaId" required defaultValue=""><option value="" disabled>Elige…</option>{cuentasBase.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Campo>
                    <Campo etiqueta="Fecha"><Input type="date" name="fecha" defaultValue={hoy} required /></Campo>
                    <Campo etiqueta="Categoría del ingreso"><Select name="categoriaId" defaultValue=""><option value="">Sin categoría</option>{d.catIngreso.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Campo>
                  </div>
                </Formulario>
              )}
            </Card>
          )}

          {conFacturacion && (
            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Factura</h2>
                {puede(s.rol, "facturacion:emitir") && t.ingresoId && !d.facturas.some((f) => f.estado !== "CANCELADA") && <BotonLink href={`/facturacion/nueva?traslado=${t.id}`} variante="suave">Facturar</BotonLink>}
              </div>
              {d.facturas.length === 0 ? <p className="text-sm text-muted">{t.ingresoId ? "Cobrado y sin factura." : "Se puede facturar cuando esté cobrado."}</p> : (
                <ul className="space-y-2 text-sm">
                  {d.facturas.map((f) => <li key={f.id} className="flex items-center justify-between gap-2"><Link href={`/facturacion/${f.id}`} className="text-brand">{aIso(f.creadoEn)} · {dinero(f.totalCentavos, s.moneda)}</Link><Insignia tono={TONO_FACTURA[f.estado]}>{ESTADOS_FACTURA[f.estado]}</Insignia></li>)}
                </ul>
              )}
            </Card>
          )}

          {conFinanzas && conGastos && (
            <Card>
              <h2 className="mb-3 font-semibold">Gastos del traslado</h2>
              {gastos.length > 0 && (
                <div className="mb-4">
                  <Tabla>
                    <thead><tr><Th>Concepto</Th><Th>Monto</Th></tr></thead>
                    <tbody>{gastos.map((g) => <tr key={g.id}><Td><Link href={`/gastos/${g.id}`} className="text-brand">{g.concepto}</Link><span className="block text-xs text-muted">{aIso(g.fecha)}</span></Td><Td className="whitespace-nowrap">{dinero(g.montoBaseCentavos, s.moneda)}</Td></tr>)}</tbody>
                  </Tabla>
                  <p className="mt-3 flex justify-between text-sm"><span className="text-muted">Resultado (precio − gastos)</span><strong className={resultadoCentavos < 0 ? "text-red-700 dark:text-red-300" : ""}>{dinero(resultadoCentavos, s.moneda)}</strong></p>
                  <p className="text-xs text-muted">Gastos: {dinero(gastosCentavos, s.moneda)}</p>
                </div>
              )}
              <Formulario accion={gastoAccion.bind(null, t.id)} enviar="Registrar gasto">
                <div className="space-y-3">
                  <Campo etiqueta="Concepto"><Input name="concepto" placeholder="Gasolina, caseta, pago al transportista…" required /></Campo>
                  <div className="grid grid-cols-2 gap-3">
                    <Campo etiqueta="Monto"><Input name="monto" inputMode="decimal" required /></Campo>
                    <Campo etiqueta="Fecha"><Input type="date" name="fecha" defaultValue={aIso(t.fecha)} required /></Campo>
                  </div>
                  <Campo etiqueta="Pagado con"><Select name="cuentaId" required defaultValue=""><option value="" disabled>Elige…</option>{d.cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}</Select></Campo>
                  <Campo etiqueta="Categoría"><Select name="categoriaId" defaultValue=""><option value="">Sin categoría</option>{d.catGasto.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Campo>
                  <Campo etiqueta="Proveedor"><Input name="proveedor" /></Campo>
                </div>
              </Formulario>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
