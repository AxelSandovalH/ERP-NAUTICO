import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { dinero, fechaLarga } from "@/lib/fechas";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { ESTADOS_RESERVA, METODOS_PAGO, ORIGENES, TONO_RESERVA } from "@/lib/etiquetas";
import { Card, Campo, Input, Insignia, PageHeader, Select, Tabla, Td, Th } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { cambiarEstado, eliminarPago, registrarPago } from "../actions";

const SIGUIENTES: Record<string, { a: "PENDIENTE" | "CONFIRMADA" | "COMPLETADA" | "CANCELADA"; etiqueta: string; peligro?: boolean }[]> = {
  PENDIENTE: [{ a: "CONFIRMADA", etiqueta: "Confirmar" }, { a: "CANCELADA", etiqueta: "Cancelar", peligro: true }],
  CONFIRMADA: [{ a: "COMPLETADA", etiqueta: "Marcar completada" }, { a: "CANCELADA", etiqueta: "Cancelar", peligro: true }],
  COMPLETADA: [],
  CANCELADA: [{ a: "PENDIENTE", etiqueta: "Reactivar" }],
};

export default async function ReservaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; vista?: string; fecha?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireModulo("reservas");
  const r = await withTenant(s.tenantId, (tx) =>
    tx.reserva.findUnique({ where: { id }, include: { cliente: true, embarcacion: true, tarifa: true, creador: true, pagos: { orderBy: { pagadoEn: "asc" } } } }));
  if (!r) notFound();
  const pagado = r.pagos.reduce((a, p) => a + p.montoCentavos, 0);
  const saldo = r.totalCentavos - pagado;
  const escribir = puede(s.rol, "reservas:escribir");
  const cobrar = puede(s.rol, "reservas:cobrar");
  const volver = sp.from === "calendario" && s.modulos.includes("calendario")
    ? `/calendario?vista=${encodeURIComponent(sp.vista ?? "dayGridMonth")}${sp.fecha ? `&fecha=${encodeURIComponent(sp.fecha)}` : ""}`
    : null;
  return (
    <>
      {volver && <Link href={volver} className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Volver al calendario</Link>}
      <PageHeader titulo={`Reserva #${r.folio}`} sub={fechaLarga(r.fecha.toISOString().slice(0, 10))}
        acciones={escribir && SIGUIENTES[r.estado].map((x) => (
          <BotonAccion key={x.a} etiqueta={x.etiqueta} variante={x.peligro ? "peligro" : "primario"}
            confirmar={x.peligro ? "¿Cancelar esta reserva? Se libera el horario." : undefined}
            accion={cambiarEstado.bind(null, r.id, x.a)} />
        ))} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Detalle</h2>
            <Insignia tono={TONO_RESERVA[r.estado]}>{ESTADOS_RESERVA[r.estado]}</Insignia>
          </div>
          <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Embarcación</dt><dd>{r.embarcacion.nombre}</dd>
            <dt className="text-muted">Horario</dt><dd>{minutosAHora(r.inicioMin)} – {minutosAHora(r.finMin)}</dd>
            <dt className="text-muted">Pasajeros</dt><dd>{r.pax}</dd>
            <dt className="text-muted">Tarifa</dt><dd>{r.tarifa?.nombre ?? "Precio libre"}</dd>
            <dt className="text-muted">Origen</dt><dd>{ORIGENES[r.origen]}</dd>
            <dt className="text-muted">Cliente</dt><dd><Link href={`/clientes/${r.clienteId}`} className="text-brand">{r.cliente.nombre}</Link>{r.cliente.telefono ? ` · ${r.cliente.telefono}` : ""}</dd>
            <dt className="text-muted">Creada por</dt><dd>{r.creador?.nombre ?? "—"}</dd>
            {r.notas && (<><dt className="text-muted">Notas</dt><dd className="whitespace-pre-wrap">{r.notas}</dd></>)}
          </dl>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Pagos</h2>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center text-sm">
            <div><p className="text-muted">Total</p><p className="font-semibold">{dinero(r.totalCentavos, s.moneda)}</p></div>
            <div><p className="text-muted">Pagado</p><p className="font-semibold">{dinero(pagado, s.moneda)}</p></div>
            <div><p className="text-muted">Saldo</p><p className="font-semibold">{dinero(saldo, s.moneda)}</p></div>
          </div>
          {r.pagos.length > 0 && (
            <Tabla>
              <thead><tr><Th>Fecha</Th><Th>Método</Th><Th>Monto</Th><Th /></tr></thead>
              <tbody>
                {r.pagos.map((p) => (
                  <tr key={p.id}>
                    <Td>{p.pagadoEn.toISOString().slice(0, 10)}</Td><Td>{METODOS_PAGO[p.metodo]}{p.referencia ? ` · ${p.referencia}` : ""}</Td>
                    <Td>{dinero(p.montoCentavos, s.moneda)}</Td>
                    <Td>{cobrar && <BotonAccion etiqueta="Quitar" variante="peligro" confirmar="¿Eliminar este pago?" accion={eliminarPago.bind(null, r.id, p.id)} />}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {cobrar && r.estado !== "CANCELADA" && saldo > 0 && (
            <Formulario accion={registrarPago.bind(null, r.id)} enviar="Registrar pago" className="mt-4 grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="Monto"><Input name="monto" inputMode="decimal" defaultValue={String(saldo / 100)} required /></Campo>
              <Campo etiqueta="Método">
                <Select name="metodo">{Object.entries(METODOS_PAGO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              </Campo>
              <Campo etiqueta="Referencia"><Input name="referencia" /></Campo>
            </Formulario>
          )}
        </Card>
      </div>
    </>
  );
}
