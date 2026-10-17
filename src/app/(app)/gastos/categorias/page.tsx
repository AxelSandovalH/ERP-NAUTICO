import Link from "next/link";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { asegurarCategoriasBase } from "@/lib/finanzas/servicio";
import { Campo, Card, Input, Insignia, PageHeader, Select } from "@/components/ui";
import { Formulario } from "@/components/formulario";
import { BotonAccion } from "@/components/boton-accion";
import { alternarCategoriaAccion, crearCategoriaAccion } from "../actions";

export const metadata = { title: "Categorías · ERP Náutico" };

export default async function CategoriasPage() {
  const s = await requireModulo("gastos", "gastos:administrar");
  const cats = await withTenant(s.tenantId, async (tx) => { await asegurarCategoriasBase(tx, s.tenantId); return tx.categoria.findMany({ orderBy: [{ tipo: "asc" }, { orden: "asc" }] }); });
  const grupo = (tipo: "GASTO" | "INGRESO") => cats.filter((c) => c.tipo === tipo);
  return (
    <>
      <Link href="/gastos" className="mb-3 inline-block text-sm text-muted hover:text-foreground">← Gastos</Link>
      <PageHeader titulo="Categorías" sub="Para clasificar gastos e ingresos" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-6 sm:grid-cols-2">
          {(["GASTO", "INGRESO"] as const).map((tipo) => (
            <Card key={tipo}>
              <h2 className="mb-3 font-semibold">{tipo === "GASTO" ? "De gastos" : "De ingresos"}</h2>
              <ul className="divide-y divide-line text-sm">
                {grupo(tipo).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <span className={c.activa ? "" : "text-muted line-through"}>{c.nombre} {c.clave && <Insignia tono="azul">sistema</Insignia>}</span>
                    {!c.clave && <BotonAccion etiqueta={c.activa ? "Ocultar" : "Mostrar"} accion={alternarCategoriaAccion.bind(null, c.id)} />}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Nueva categoría</h2>
          <Formulario accion={crearCategoriaAccion} enviar="Agregar" className="space-y-3">
            <Campo etiqueta="Tipo"><Select name="tipo" defaultValue="GASTO"><option value="GASTO">De gastos</option><option value="INGRESO">De ingresos</option></Select></Campo>
            <Campo etiqueta="Nombre"><Input name="nombre" required /></Campo>
          </Formulario>
          <p className="mt-3 text-xs text-muted">Las de «sistema» (nómina, comisiones, reservas) las usan las conexiones automáticas y no se pueden ocultar.</p>
        </Card>
      </div>
    </>
  );
}
