import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aIso, dinero, hoyIso } from "@/lib/fechas";
import { puede } from "@/modules/permisos";
import { cantidadTexto } from "@/lib/inventario/cantidades";
import { asegurarUbicaciones } from "@/lib/inventario/servicio";
import { Campo, Input, Insignia, PageHeader, Select, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAnular } from "@/components/inventario/boton-anular";
import { SubnavInventario } from "@/components/inventario/subnav";
import { anularAccion, compraAccion, consumoAccion, mermaAccion, traspasoAccion } from "../actions";

export const metadata = { title: "Movimientos · Inventario · ERP Náutico" };

const TIPOS = {
  COMPRA: { texto: "Compra", tono: "verde" }, CONSUMO: { texto: "Consumo", tono: "azul" }, MERMA: { texto: "Merma", tono: "rojo" },
  AJUSTE: { texto: "Ajuste", tono: "ambar" }, TRASPASO_SALIDA: { texto: "Traspaso (sale)", tono: "gris" }, TRASPASO_ENTRADA: { texto: "Traspaso (entra)", tono: "gris" },
} as const;

export default async function MovimientosPage() {
  const s = await requireModulo("inventario", "inventario:ver");
  const admin = puede(s.rol, "inventario:administrar"), operar = puede(s.rol, "inventario:operar");
  const hoy = hoyIso(s.zonaHoraria);
  const d = await withTenant(s.tenantId, async (tx) => {
    await asegurarUbicaciones(tx, s.tenantId);
    return {
      movs: await tx.movimientoInventario.findMany({ orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 100, include: { articulo: true, ubicacion: true } }),
      articulos: await tx.articulo.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
      ubicaciones: await tx.ubicacion.findMany({ where: { activa: true }, orderBy: [{ tipo: "asc" }, { nombre: "asc" }] }),
      cuentas: admin ? await tx.cuenta.findMany({ where: { activa: true }, orderBy: { nombre: "asc" } }) : [],
      categorias: admin ? await tx.categoria.findMany({ where: { tipo: "GASTO", activa: true }, orderBy: { nombre: "asc" } }) : [],
    };
  });
  const selArticulo = <Campo etiqueta="Artículo"><Select name="articuloId" required defaultValue=""><option value="" disabled>Elige…</option>{d.articulos.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.unidad})</option>)}</Select></Campo>;
  const selUb = (nombre: string, etiqueta: string) => <Campo etiqueta={etiqueta}><Select name={nombre} required defaultValue=""><option value="" disabled>Elige…</option>{d.ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</Select></Campo>;
  const fecha = <Campo etiqueta="Fecha"><Input type="date" name="fecha" defaultValue={hoy} required /></Campo>;
  const cantidad = <Campo etiqueta="Cantidad"><Input name="cantidad" inputMode="decimal" required /></Campo>;

  return (
    <>
      <PageHeader titulo="Movimientos" sub="Compras, consumos, mermas y traspasos" />
      <SubnavInventario activo="/inventario/movimientos" />
      {d.articulos.length === 0 ? <Vacio>Primero crea tus artículos en «Artículos y ubicaciones».</Vacio> : (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          {admin && (
            <details className="rounded-xl border border-line bg-surface p-4">
              <summary className="cursor-pointer font-semibold">Registrar compra</summary>
              <p className="mb-3 mt-2 text-xs text-muted">Elige la cuenta con la que pagaste y se crea el gasto. Sin cuenta solo entra al inventario (útil para el inventario inicial).</p>
              <Formulario accion={compraAccion} enviar="Registrar compra">
                <div className="grid gap-3 sm:grid-cols-2">
                  {selArticulo}{selUb("ubicacionId", "Entra a")}{cantidad}
                  <Campo etiqueta="Total pagado" ayuda="En la moneda de la cuenta"><Input name="total" inputMode="decimal" required /></Campo>
                  <Campo etiqueta="Pagado con"><Select name="cuentaId" defaultValue=""><option value="">Sin gasto (inventario inicial)</option>{d.cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}</Select></Campo>
                  <Campo etiqueta="Categoría del gasto"><Select name="categoriaId" defaultValue=""><option value="">Sin categoría</option>{d.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></Campo>
                  {fecha}<Campo etiqueta="Proveedor"><Input name="proveedor" /></Campo>
                </div>
                <Campo etiqueta="Notas"><Input name="notas" /></Campo>
              </Formulario>
            </details>
          )}
          {operar && (
            <details className="rounded-xl border border-line bg-surface p-4">
              <summary className="cursor-pointer font-semibold">Registrar consumo</summary>
              <Formulario accion={consumoAccion} enviar="Registrar consumo">
                <div className="mt-3 grid gap-3 sm:grid-cols-2">{selArticulo}{selUb("ubicacionId", "Se usó en")}{cantidad}{fecha}</div>
                <Campo etiqueta="Notas"><Input name="notas" placeholder="Salida de la mañana…" /></Campo>
              </Formulario>
            </details>
          )}
          {operar && (
            <details className="rounded-xl border border-line bg-surface p-4">
              <summary className="cursor-pointer font-semibold">Registrar merma</summary>
              <Formulario accion={mermaAccion} enviar="Registrar merma">
                <div className="mt-3 grid gap-3 sm:grid-cols-2">{selArticulo}{selUb("ubicacionId", "Se perdió en")}{cantidad}{fecha}</div>
                <Campo etiqueta="Motivo" ayuda="Obligatorio"><Input name="notas" placeholder="Se derritió, caducó, se rompió…" required /></Campo>
              </Formulario>
            </details>
          )}
          {operar && (
            <details className="rounded-xl border border-line bg-surface p-4">
              <summary className="cursor-pointer font-semibold">Traspasar entre ubicaciones</summary>
              <Formulario accion={traspasoAccion} enviar="Registrar traspaso">
                <div className="mt-3 grid gap-3 sm:grid-cols-2">{selArticulo}{cantidad}{selUb("origenId", "Sale de")}{selUb("destinoId", "Llega a")}{fecha}</div>
                <Campo etiqueta="Notas"><Input name="notas" /></Campo>
              </Formulario>
            </details>
          )}
        </div>
      )}

      {d.movs.length === 0 ? <Vacio>Aún no hay movimientos.</Vacio> : (
        <Tabla>
          <thead><tr><Th>Fecha</Th><Th>Tipo</Th><Th>Artículo</Th><Th>Ubicación</Th><Th>Cantidad</Th><Th>Costo unit.</Th>{admin && <Th />}</tr></thead>
          <tbody>
            {d.movs.map((m) => {
              const t = TIPOS[m.tipo];
              return (
                <tr key={m.id} className={m.estado === "CANCELADO" ? "opacity-50" : ""}>
                  <Td className="whitespace-nowrap">{aIso(m.fecha)}</Td>
                  <Td><Insignia tono={t.tono}>{t.texto}</Insignia>{m.estado === "CANCELADO" && <> <Insignia>Anulado</Insignia></>}</Td>
                  <Td className="font-medium">{m.articulo.nombre}{m.notas && <span className="block text-xs font-normal text-muted">{m.notas}</span>}</Td>
                  <Td>{m.ubicacion.nombre}</Td>
                  <Td className={`whitespace-nowrap font-medium ${m.cantidadMilli < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>{m.cantidadMilli > 0 ? "+" : ""}{cantidadTexto(m.cantidadMilli)} {m.articulo.unidad}</Td>
                  <Td className="whitespace-nowrap">{m.costoUnitarioCentavos ? dinero(m.costoUnitarioCentavos, s.moneda) : "—"}</Td>
                  {admin && <Td>{m.estado === "ACTIVO" && <BotonAnular accion={anularAccion.bind(null, m.id)} />}</Td>}
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
