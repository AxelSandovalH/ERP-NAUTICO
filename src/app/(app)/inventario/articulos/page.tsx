import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { cantidadTexto } from "@/lib/inventario/cantidades";
import { asegurarUbicaciones } from "@/lib/inventario/servicio";
import { Campo, Card, Input, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { SubnavInventario } from "@/components/inventario/subnav";
import { alternarArticuloAccion, crearAlmacenAccion, guardarArticuloAccion } from "../actions";

export const metadata = { title: "Artículos · Inventario · FleetNautic" };

function CamposArticulo({ v }: { v?: { nombre: string; unidad: string; categoria: string | null; minimoMilli: number; notas: string | null } }) {
  return (
    <div className="space-y-3">
      <Campo etiqueta="Nombre"><Input name="nombre" defaultValue={v?.nombre} placeholder="Hielo en bolsa" required /></Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Unidad"><Input name="unidad" defaultValue={v?.unidad} placeholder="bolsa, L, kg, pza" required /></Campo>
        <Campo etiqueta="Categoría"><Input name="categoria" defaultValue={v?.categoria ?? ""} placeholder="Bebidas" /></Campo>
      </div>
      <Campo etiqueta="Existencia mínima" ayuda="Debajo de esta cantidad (sumando todas las ubicaciones) se avisa que hay que reabastecer. Vacío = sin aviso."><Input name="minimo" inputMode="decimal" defaultValue={v?.minimoMilli ? cantidadTexto(v.minimoMilli).replace(/,/g, "") : ""} /></Campo>
      <Campo etiqueta="Notas"><Input name="notas" defaultValue={v?.notas ?? ""} /></Campo>
    </div>
  );
}

export default async function ArticulosPage() {
  const s = await requireModulo("inventario", "inventario:ver");
  const admin = puede(s.rol, "inventario:administrar");
  const { articulos, ubicaciones } = await withTenant(s.tenantId, async (tx) => {
    await asegurarUbicaciones(tx, s.tenantId);
    return { articulos: await tx.articulo.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] }), ubicaciones: await tx.ubicacion.findMany({ orderBy: [{ tipo: "asc" }, { nombre: "asc" }] }) };
  });
  return (
    <>
      <PageHeader titulo="Artículos y ubicaciones" sub="Qué inventarías y dónde lo guardas" />
      <SubnavInventario activo="/inventario/articulos" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {articulos.length === 0 ? <Vacio>Aún no hay artículos.</Vacio> : (
            <Tabla>
              <thead><tr><Th>Artículo</Th><Th>Unidad</Th><Th>Mínimo</Th>{admin && <Th />}</tr></thead>
              <tbody>
                {articulos.map((a) => (
                  <tr key={a.id} className={a.activo ? "" : "opacity-60"}>
                    <Td className="font-medium">{a.nombre}{a.categoria && <span className="block text-xs font-normal text-muted">{a.categoria}</span>}{!a.activo && <> <Insignia>Inactivo</Insignia></>}
                      {admin && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-normal text-brand">Editar</summary>
                          <div className="mt-3 font-normal"><Formulario accion={guardarArticuloAccion.bind(null, a.id)}><CamposArticulo v={a} /></Formulario></div>
                        </details>
                      )}
                    </Td>
                    <Td>{a.unidad}</Td>
                    <Td>{a.minimoMilli ? cantidadTexto(a.minimoMilli) : "—"}</Td>
                    {admin && <Td><BotonAccion etiqueta={a.activo ? "Desactivar" : "Activar"} accion={alternarArticuloAccion.bind(null, a.id, !a.activo)} /></Td>}
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </div>
        <div className="space-y-6">
          {admin && (
            <Card>
              <h2 className="mb-4 font-semibold">Nuevo artículo</h2>
              <Formulario accion={guardarArticuloAccion.bind(null, null)} enviar="Crear artículo"><CamposArticulo /></Formulario>
            </Card>
          )}
          <Card>
            <h2 className="mb-1 font-semibold">Ubicaciones</h2>
            <p className="mb-3 text-xs text-muted">Cada embarcación tiene la suya automáticamente. Agrega las bodegas que uses.</p>
            <ul className="mb-4 space-y-1 text-sm">
              {ubicaciones.map((u) => <li key={u.id} className="flex justify-between"><span>{u.nombre}</span><span className="text-xs text-muted">{u.tipo === "ALMACEN" ? "Almacén" : "Embarcación"}</span></li>)}
            </ul>
            {admin && <Formulario accion={crearAlmacenAccion} enviar="Agregar almacén"><Campo etiqueta="Nombre"><Input name="nombre" placeholder="Bodega del muelle" required /></Campo></Formulario>}
          </Card>
        </div>
      </div>
    </>
  );
}
