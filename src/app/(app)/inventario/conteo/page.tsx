import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { hoyIso } from "@/lib/fechas";
import { cantidadTexto } from "@/lib/inventario/cantidades";
import { asegurarUbicaciones, existencias } from "@/lib/inventario/servicio";
import { Campo, Card, Input, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { SubnavInventario } from "@/components/inventario/subnav";
import { conteoAccion } from "../actions";

export const metadata = { title: "Conteo físico · Inventario · ERP Náutico" };

export default async function ConteoPage({ searchParams }: { searchParams: Promise<{ ub?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("inventario", "inventario:operar");
  const d = await withTenant(s.tenantId, async (tx) => {
    await asegurarUbicaciones(tx, s.tenantId);
    return { ubicaciones: await tx.ubicacion.findMany({ where: { activa: true }, orderBy: [{ tipo: "asc" }, { nombre: "asc" }] }), articulos: await tx.articulo.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }), ex: await existencias(tx) };
  });
  const ub = d.ubicaciones.find((u) => u.id === q.ub) ?? null;

  return (
    <>
      <PageHeader titulo="Conteo físico" sub="Compara lo que hay con lo que dice el sistema" />
      <SubnavInventario activo="/inventario/conteo" />
      <nav aria-label="Ubicación" className="mb-5 flex flex-wrap gap-2 text-sm">
        {d.ubicaciones.map((u) => <Link key={u.id} href={`/inventario/conteo?ub=${u.id}`} aria-current={ub?.id === u.id ? "true" : undefined} className={`rounded-full border px-3 py-1 ${ub?.id === u.id ? "border-brand bg-brand-soft font-medium" : "border-line hover:bg-brand-soft/50"}`}>{u.nombre}</Link>)}
      </nav>
      {!ub ? <Vacio>Elige la ubicación que vas a contar.</Vacio> : d.articulos.length === 0 ? <Vacio>No hay artículos activos.</Vacio> : (
        <Formulario accion={conteoAccion.bind(null, ub.id)} enviar="Registrar conteo">
          <Card className="text-sm text-muted">Captura lo que contaste en <strong>{ub.nombre}</strong>. Los artículos que dejes vacíos no se tocan; las diferencias quedan como ajustes en Movimientos.</Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Fecha del conteo"><Input type="date" name="fecha" defaultValue={hoyIso(s.zonaHoraria)} required /></Campo>
            <Campo etiqueta="Notas"><Input name="notas" placeholder="Conteo de fin de mes" /></Campo>
          </div>
          <Tabla>
            <thead><tr><Th>Artículo</Th><Th>Según el sistema</Th><Th>Contado</Th></tr></thead>
            <tbody>
              {d.articulos.map((a) => (
                <tr key={a.id}>
                  <Td className="font-medium">{a.nombre}</Td>
                  <Td>{cantidadTexto(d.ex.get(`${a.id}|${ub.id}`) ?? 0)} {a.unidad}</Td>
                  <Td><Input name={`c_${a.id}`} inputMode="decimal" aria-label={`Contado de ${a.nombre}`} className="max-w-32" /></Td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Formulario>
      )}
    </>
  );
}
