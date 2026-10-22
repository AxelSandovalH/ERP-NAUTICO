import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero, fechaLarga } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { ESTADOS_RESERVA, METODOS_PAGO, ORIGENES, TONO_RESERVA } from "@/lib/etiquetas";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { detalleSalida } from "@/lib/actividades/servicio";
import { saldo } from "@/lib/actividades/reglas";
import { BotonLink, Campo, Card, Input, Insignia, PageHeader, Select, Tabla, Td, Th, Textarea, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { Tile } from "@/components/graficas/tile";
import { CamposSalida } from "@/components/actividades/form-salida";
import { cambiarPaxAccion, cancelarReservaAccion, editarSalidaAccion, eliminarPagoAccion, estadoSalidaAccion, pagoAccion, reservarAccion } from "../../actions";

export default async function SalidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("actividades", "actividades:ver");
  const d = await withTenant(s.tenantId, async (tx) => ({
    salida: await detalleSalida(tx, id),
    clientes: await tx.cliente.findMany({ orderBy: { nombre: "asc" }, take: 300, select: { id: true, nombre: true, telefono: true } }),
    embarcaciones: await tx.embarcacion.findMany({ where: { estado: "ACTIVA" }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, capacidad: true } }),
    guias: await tx.tripulante.findMany({ where: { activo: true }, orderBy: [{ rol: "asc" }, { nombre: "asc" }] }),
  }));
  const x = d.salida;
  if (!x) notFound();
  const m = s.moneda;
  const programada = x.estado === "PROGRAMADA";
  const escribir = puede(s.rol, "actividades:escribir"), reservar = puede(s.rol, "actividades:reservar"), cobrar = puede(s.rol, "actividades:cobrar");
  const vivas = x.reservas.filter((r) => r.estado !== "CANCELADA");
  const cobrado = vivas.reduce((a, r) => a + r.pagado, 0), porCobrar = vivas.reduce((a, r) => a + saldo(r.totalCentavos, r.pagado), 0);
  const guias = d.guias.map((g) => ({ id: g.id, nombre: `${g.nombre} ${g.apellido}`.trim() }));

  return (
    <>
      <Link href="/actividades/salidas" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Salidas</Link>
      <PageHeader titulo={x.actividad.nombre} sub={`${fechaLarga(aIso(x.fecha))} · ${minutosAHora(x.inicioMin)} a ${minutosAHora(x.finMin)}`}
        acciones={<>
          {x.estado === "COMPLETADA" && <Insignia tono="verde">Completada</Insignia>}
          {x.estado === "CANCELADA" && <Insignia tono="rojo">Cancelada</Insignia>}
          {escribir && programada && <BotonAccion etiqueta="Marcar completada" accion={estadoSalidaAccion.bind(null, x.id, "COMPLETADA")} />}
          {escribir && programada && <BotonAccion etiqueta="Cancelar salida" variante="peligro" accion={estadoSalidaAccion.bind(null, x.id, "CANCELADA")} confirmar="Se cancelarán también sus reservas. ¿Cancelar la salida?" />}
        </>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Tile etiqueta="Lugares apartados" valor={`${x.ocupados} de ${x.cupo}`} nota={x.libres ? `${x.libres} libres` : "Salida llena"} />
        <Tile etiqueta="Cobrado" valor={dinero(cobrado, m)} />
        <Tile etiqueta="Por cobrar" valor={dinero(porCobrar, m)} nota={`${dinero(x.precioCentavos, m)} por persona`} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="mb-3 font-semibold">Detalles</h2>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Embarcación</dt><dd>{x.embarcacion?.nombre ?? "Sin embarcación"}</dd>
            <dt className="text-muted">Guía</dt><dd>{x.guia ? `${x.guia.nombre} ${x.guia.apellido}`.trim() : "Sin asignar"}</dd>
            <dt className="text-muted">Punto de encuentro</dt><dd>{x.actividad.puntoEncuentro ?? "—"}</dd>
            {x.notas && <><dt className="text-muted">Notas</dt><dd className="whitespace-pre-line">{x.notas}</dd></>}
          </dl>
          {escribir && programada && (
            <details className="mt-4 border-t border-line pt-3">
              <summary className="cursor-pointer text-sm font-medium text-brand">Editar salida</summary>
              <div className="mt-3">
                <Formulario accion={editarSalidaAccion.bind(null, x.id)}>
                  <CamposSalida embarcaciones={d.embarcaciones} guias={guias} v={{ fecha: aIso(x.fecha), hora: minutosAHora(x.inicioMin), cupo: x.cupo, precioCentavos: x.precioCentavos, embarcacionId: x.embarcacionId, guiaId: x.guiaId, notas: x.notas }} />
                </Formulario>
              </div>
            </details>
          )}
        </Card>

        {reservar && programada && (
          <Card>
            <h2 className="mb-3 font-semibold">Nueva reserva</h2>
            {x.libres === 0 ? <p className="text-sm text-muted">La salida está llena.</p> : (
              <Formulario accion={reservarAccion.bind(null, x.id)} enviar="Reservar">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Cliente existente" className="sm:col-span-2">
                    <Select name="clienteId" defaultValue=""><option value="">— Cliente nuevo (llena su nombre) —</option>{d.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` · ${c.telefono}` : ""}</option>)}</Select>
                  </Campo>
                  <Campo etiqueta="Nombre (si es nuevo)"><Input name="nombre" /></Campo>
                  <Campo etiqueta="Teléfono"><Input name="telefono" inputMode="tel" /></Campo>
                  <Campo etiqueta={`Personas (hasta ${x.libres})`}><Input name="pax" type="number" min={1} max={x.libres} defaultValue={2} required /></Campo>
                  <Campo etiqueta="Origen"><Select name="origen" defaultValue="DIRECTO">{Object.entries(ORIGENES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Campo>
                  <Campo etiqueta="Notas" className="sm:col-span-2"><Textarea name="notas" className="min-h-14" /></Campo>
                </div>
              </Formulario>
            )}
          </Card>
        )}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Reservas</h2>
      {x.reservas.length === 0 ? <Vacio>Aún no hay reservas en esta salida.</Vacio> : (
        <Tabla>
          <thead><tr><Th>Cliente</Th><Th>Personas</Th><Th>Total</Th><Th>Pagado</Th><Th>Estado</Th></tr></thead>
          <tbody>
            {x.reservas.map((r) => {
              const vigente = r.estado !== "CANCELADA" && r.estado !== "COMPLETADA";
              return (
                <tr key={r.id} className={r.estado === "CANCELADA" ? "opacity-50" : ""}>
                  <Td>
                    <span className="font-medium">{r.cliente.nombre}</span> <span className="text-xs text-muted">#{r.folio}</span>
                    <span className="block text-xs text-muted">{[r.cliente.telefono, ORIGENES[r.origen]].filter(Boolean).join(" · ")}</span>
                    {vigente && (cobrar || reservar) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-normal text-brand">Cobrar / editar</summary>
                        <div className="mt-3 space-y-4 font-normal">
                          {cobrar && (
                            <div>
                              {r.pagos.length > 0 && (
                                <ul className="mb-2 space-y-1 text-xs">
                                  {r.pagos.map((p) => (
                                    <li key={p.id} className="flex items-center justify-between gap-2"><span>{dinero(p.montoCentavos, m)} · {METODOS_PAGO[p.metodo]}{p.referencia ? ` · ${p.referencia}` : ""}</span><BotonAccion etiqueta="Quitar" variante="peligro" accion={eliminarPagoAccion.bind(null, p.id)} confirmar="¿Eliminar este pago? También se cancela su ingreso." /></li>
                                  ))}
                                </ul>
                              )}
                              {saldo(r.totalCentavos, r.pagado) > 0 && (
                                <Formulario accion={pagoAccion.bind(null, r.id)} enviar="Registrar pago" className="grid gap-2 sm:grid-cols-3">
                                  <Campo etiqueta="Monto"><Input name="monto" inputMode="decimal" defaultValue={String(saldo(r.totalCentavos, r.pagado) / 100)} required /></Campo>
                                  <Campo etiqueta="Método"><Select name="metodo" defaultValue="EFECTIVO">{Object.entries(METODOS_PAGO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Campo>
                                  <Campo etiqueta="Referencia"><Input name="referencia" /></Campo>
                                </Formulario>
                              )}
                            </div>
                          )}
                          {reservar && programada && (
                            <Formulario accion={cambiarPaxAccion.bind(null, r.id)} enviar="Cambiar personas" className="flex flex-wrap items-end gap-2">
                              <Campo etiqueta="Personas"><Input name="pax" type="number" min={1} defaultValue={r.pax} className="w-24" /></Campo>
                            </Formulario>
                          )}
                          {reservar && <BotonAccion etiqueta="Cancelar reserva" variante="peligro" accion={cancelarReservaAccion.bind(null, r.id)} confirmar="¿Cancelar esta reserva?" />}
                        </div>
                      </details>
                    )}
                  </Td>
                  <Td>{r.pax}</Td>
                  <Td className="whitespace-nowrap">{dinero(r.totalCentavos, m)}</Td>
                  <Td className="whitespace-nowrap">{dinero(r.pagado, m)}{r.estado !== "CANCELADA" && r.cobro !== "LIQUIDADA" && <span className="block text-xs text-amber-700 dark:text-amber-300">Debe {dinero(saldo(r.totalCentavos, r.pagado), m)}</span>}</Td>
                  <Td><Insignia tono={TONO_RESERVA[r.estado]}>{ESTADOS_RESERVA[r.estado]}</Insignia></Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
      {!reservar && !cobrar && <p className="mt-4 text-xs text-muted">Tu rol puede ver la salida pero no crear reservas ni cobros.</p>}
      <p className="mt-6"><BotonLink variante="suave" href={`/actividades/${x.actividadId}`}>Ver la actividad</BotonLink></p>
    </>
  );
}
