import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero } from "@/lib/fechas";
import { ESTADOS_RESERVA, METODOS_PAGO, ORIGENES, TIPOS_TARIFA } from "@/lib/etiquetas";
import { Campo, Card, Input, PageHeader, Select, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { CamposBeneficiario } from "@/components/form-beneficiario";
import { ajustarMontoAccion, anularAbonoAccion, crearTarifa, eliminarTarifa, guardarBeneficiario, registrarAbonoAccion } from "../../actions";

const pct = (bp: number) => `${(bp / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} %`;

export default async function BeneficiarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireModulo("comisiones", "comisiones:administrar");
  const { b, flota, pendientes, abonos } = await withTenant(s.tenantId, async (tx) => {
    const b = await tx.beneficiario.findUnique({ where: { id }, include: { tarifas: { include: { embarcacion: { select: { nombre: true } } }, orderBy: { creadoEn: "asc" } } } });
    return {
      b,
      flota: await tx.embarcacion.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
      pendientes: b ? await tx.comision.findMany({
        where: { beneficiarioId: id, estado: "PENDIENTE" },
        include: { reserva: { include: { cliente: true, embarcacion: true } } },
        orderBy: [{ reserva: { fecha: "asc" } }, { reserva: { inicioMin: "asc" } }],
      }) : [],
      abonos: b ? await tx.abonoComision.findMany({ where: { beneficiarioId: id }, include: { _count: { select: { aplicaciones: true } } }, orderBy: { fecha: "desc" }, take: 30 }) : [],
    };
  });
  if (!b) notFound();
  const usuarios = await prisma.usuario.findMany({ where: { tenantId: s.tenantId, activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, email: true } });
  const ocupados = new Set((await withTenant(s.tenantId, (tx) => tx.beneficiario.findMany({ where: { id: { not: id }, usuarioId: { not: null } }, select: { usuarioId: true } }))).map((x) => x.usuarioId));
  const saldo = pendientes.reduce((a, c) => a + (c.montoCentavos - c.pagadoCentavos), 0);

  return (
    <>
      <Link href="/comisiones/beneficiarios" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Beneficiarios</Link>
      <PageHeader titulo={b.nombre} sub={`Saldo pendiente: ${dinero(saldo, s.moneda)}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Datos</h2>
          <Formulario accion={guardarBeneficiario.bind(null, b.id)}>
            <CamposBeneficiario v={b} usuarios={usuarios.filter((u) => !ocupados.has(u.id))} conActivo />
          </Formulario>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Tarifas</h2>
          <p className="mb-4 text-xs text-muted">Aplica la regla más específica: origen &gt; embarcación &gt; general.</p>
          {b.tarifas.length === 0 ? <Vacio>Sin tarifas: sus comisiones salen en cero.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Aplica a</Th><Th>Tipo</Th><Th>Valor</Th><Th /></tr></thead>
              <tbody>
                {b.tarifas.map((t) => {
                  const fmt = (v: number) => (t.tipo === "FIJO" ? dinero(v, s.moneda) : pct(v));
                  return (
                    <tr key={t.id}>
                      <Td>{t.embarcacion?.nombre ?? "Toda la flota"}<span className="block text-xs text-muted">{t.origen ? `Origen ${ORIGENES[t.origen]}` : "Todos los orígenes"}</span></Td>
                      <Td className="text-xs">{TIPOS_TARIFA[t.tipo]}</Td>
                      <Td>{t.tipo === "SIN" ? "—" : fmt(t.valor)}{t.umbralPax != null && t.valorAlto != null && <span className="block text-xs text-muted">{fmt(t.valorAlto)} desde {t.umbralPax} pax</span>}</Td>
                      <Td><BotonAccion etiqueta="Quitar" variante="peligro" confirmar="¿Quitar esta tarifa?" accion={eliminarTarifa.bind(null, b.id, t.id)} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabla>
          )}
          <Formulario accion={crearTarifa.bind(null, b.id)} enviar="Guardar tarifa" className="mt-4 grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Embarcación">
              <Select name="embarcacionId" defaultValue=""><option value="">Toda la flota</option>{flota.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</Select>
            </Campo>
            <Campo etiqueta="Origen de la reserva">
              <Select name="origen" defaultValue=""><option value="">Todos</option>{Object.entries(ORIGENES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            </Campo>
            <Campo etiqueta="Tipo" className="sm:col-span-2">
              <Select name="tipo" defaultValue="PORCENTAJE">{Object.entries(TIPOS_TARIFA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            </Campo>
            <Campo etiqueta="Valor" ayuda={`Monto fijo en ${s.moneda}, o porcentaje (ej. 12.5)`}><Input name="valor" inputMode="decimal" /></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Desde (pax)"><Input name="umbralPax" type="number" min={1} /></Campo>
              <Campo etiqueta="Valor alto"><Input name="valorAlto" inputMode="decimal" /></Campo>
            </div>
          </Formulario>
          <p className="mt-2 text-xs text-muted">Guardar una tarifa para la misma embarcación y origen reemplaza la anterior. El precio casa de cada embarcación se configura en Flota.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Pagar</h2>
          <p className="mb-3 text-sm text-muted">Pendiente: <b className="text-foreground">{dinero(saldo, s.moneda)}</b>. El abono se aplica a las comisiones más antiguas primero.</p>
          {saldo > 0 && (
            <Formulario accion={registrarAbonoAccion.bind(null, b.id)} enviar="Registrar abono" className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Monto"><Input name="monto" inputMode="decimal" defaultValue={String(saldo / 100)} required /></Campo>
              <Campo etiqueta="Método"><Select name="metodo" defaultValue="TRANSFERENCIA">{Object.entries(METODOS_PAGO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Campo>
              <Campo etiqueta="Referencia"><Input name="referencia" /></Campo>
              <Campo etiqueta="Notas"><Input name="notas" /></Campo>
            </Formulario>
          )}
          <h3 className="mb-2 mt-6 text-sm font-semibold">Abonos</h3>
          {abonos.length === 0 ? <p className="text-sm text-muted">Sin abonos todavía.</p> : (
            <Tabla>
              <thead><tr><Th>Fecha</Th><Th>Monto</Th><Th>Método</Th><Th>Cubre</Th><Th /></tr></thead>
              <tbody>
                {abonos.map((a) => (
                  <tr key={a.id}>
                    <Td>{aIso(a.fecha)}</Td><Td>{dinero(a.montoCentavos, s.moneda)}</Td>
                    <Td>{METODOS_PAGO[a.metodo]}{a.referencia ? ` · ${a.referencia}` : ""}</Td>
                    <Td>{a._count.aplicaciones} comis.</Td>
                    <Td><BotonAccion etiqueta="Anular" variante="peligro" confirmar="¿Anular este abono? Las comisiones vuelven a quedar pendientes." accion={anularAbonoAccion.bind(null, b.id, a.id)} /></Td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">Comisiones pendientes ({pendientes.length})</h2>
          {pendientes.length === 0 ? <Vacio>Nada pendiente.</Vacio> : (
            <ul className="divide-y divide-line">
              {pendientes.map((c) => (
                <li key={c.id} className="py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/reservas/${c.reservaId}`} className="font-medium text-brand">#{c.reserva.folio}</Link>{" "}
                      <span className="text-muted">{aIso(c.reserva.fecha)} · {c.reserva.cliente.nombre} · {c.reserva.embarcacion.nombre} · {ESTADOS_RESERVA[c.reserva.estado]}</span>
                      <p className="text-xs text-muted">{c.regla}{c.manual ? ` — ${c.notas}` : ""}</p>
                      {c.advertencia && <p className="text-xs text-amber-700 dark:text-amber-300">⚠ {c.advertencia}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{dinero(c.montoCentavos - c.pagadoCentavos, s.moneda)}</p>
                      {c.pagadoCentavos > 0 && <p className="text-xs text-muted">de {dinero(c.montoCentavos, s.moneda)}</p>}
                    </div>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-muted hover:text-foreground">Ajustar monto</summary>
                    <Formulario accion={ajustarMontoAccion.bind(null, c.id, b.id)} enviar="Ajustar" variante="suave" className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Campo etiqueta="Nuevo monto"><Input name="monto" inputMode="decimal" defaultValue={String(c.montoCentavos / 100)} /></Campo>
                      <Campo etiqueta="Motivo"><Input name="motivo" required /></Campo>
                    </Formulario>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
