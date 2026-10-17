import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { aDate, aIso, dinero, hoyIso, mesDe, nombreMes, sumarMeses } from "@/lib/fechas";
import { asegurarCategoriasBase } from "@/lib/finanzas/servicio";
import { ORIGENES_MOVIMIENTO } from "@/lib/etiquetas";
import { BotonLink, Card, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";

export const metadata = { title: "Gastos · ERP Náutico" };

type SP = { mes?: string; cat?: string; cuenta?: string; emb?: string; q?: string };

export default async function GastosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const s = await requireModulo("gastos", "gastos:registrar");
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : mesDe(hoyIso(s.zonaHoraria));
  const where: Prisma.GastoWhereInput = {
    fecha: { gte: aDate(`${mes}-01`), lt: aDate(`${sumarMeses(mes, 1)}-01`) },
    ...(sp.cat ? { categoriaId: sp.cat } : {}), ...(sp.cuenta ? { cuentaId: sp.cuenta } : {}), ...(sp.emb ? { embarcacionId: sp.emb } : {}),
    ...(sp.q?.trim() ? { OR: [{ concepto: { contains: sp.q.trim(), mode: "insensitive" } }, { proveedor: { contains: sp.q.trim(), mode: "insensitive" } }] } : {}),
  };
  const d = await withTenant(s.tenantId, async (tx) => {
    await asegurarCategoriasBase(tx, s.tenantId);
    const gastos = await tx.gasto.findMany({ where, orderBy: [{ fecha: "desc" }, { creadoEn: "desc" }], take: 300, include: { categoria: true, cuenta: true, embarcacion: true, _count: { select: { comprobantes: true } } } });
    const porCat = await tx.gasto.groupBy({ by: ["categoriaId"], where: { ...where, estado: "ACTIVO" }, _sum: { montoBaseCentavos: true } });
    const cats = await tx.categoria.findMany({ where: { tipo: "GASTO" }, orderBy: { orden: "asc" } });
    const cuentas = await tx.cuenta.findMany({ orderBy: { nombre: "asc" } });
    const flota = await tx.embarcacion.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } });
    return { gastos, porCat, cats, cuentas, flota };
  });
  const total = d.gastos.filter((g) => g.estado === "ACTIVO").reduce((a, g) => a + g.montoBaseCentavos, 0);
  const nombreCat = (id: string | null) => d.cats.find((c) => c.id === id)?.nombre ?? "Sin categoría";
  const desglose = d.porCat.map((x) => ({ nombre: nombreCat(x.categoriaId), monto: x._sum.montoBaseCentavos ?? 0 })).sort((a, b) => b.monto - a.monto);
  const qs = (m: string) => { const p = new URLSearchParams({ ...(sp.cat ? { cat: sp.cat } : {}), ...(sp.cuenta ? { cuenta: sp.cuenta } : {}), ...(sp.emb ? { emb: sp.emb } : {}), mes: m }); return `/gastos?${p}`; };

  return (
    <>
      <PageHeader titulo="Gastos" sub={nombreMes(mes)}
        acciones={<>
          <BotonLink variante="suave" href={qs(sumarMeses(mes, -1))}>←</BotonLink>
          <BotonLink variante="suave" href={qs(mesDe(hoyIso(s.zonaHoraria)))}>Este mes</BotonLink>
          <BotonLink variante="suave" href={qs(sumarMeses(mes, 1))}>→</BotonLink>
          {puede(s.rol, "gastos:administrar") && <BotonLink variante="suave" href="/gastos/categorias">Categorías</BotonLink>}
          <BotonLink href="/gastos/nuevo">Nuevo gasto</BotonLink>
        </>} />

      <form className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="mes" value={mes} />
        {([["cat", "Categoría", d.cats.map((c) => [c.id, c.nombre])], ["cuenta", "Cuenta", d.cuentas.map((c) => [c.id, c.nombre])], ["emb", "Embarcación", d.flota.map((e) => [e.id, e.nombre])]] as const).map(([name, etiqueta, opciones]) => (
          <label key={name} className="text-sm">{etiqueta}
            <select name={name} defaultValue={sp[name] ?? ""} className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2"><option value="">Todas</option>{opciones.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          </label>
        ))}
        <label className="text-sm">Buscar<input name="q" defaultValue={sp.q} placeholder="Concepto o proveedor" className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2" /></label>
        <button className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-brand-soft">Filtrar</button>
      </form>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card><p className="text-sm text-muted">Total del periodo ({s.moneda})</p><p className="mt-1 text-3xl font-semibold">{dinero(total, s.moneda)}</p><p className="mt-1 text-xs text-muted">{d.gastos.filter((g) => g.estado === "ACTIVO").length} gastos · los cancelados no suman</p></Card>
        <Card>
          <p className="mb-2 text-sm text-muted">Por categoría</p>
          {desglose.length === 0 ? <p className="text-sm text-muted">Sin gastos.</p> : (
            <ul className="space-y-1.5">
              {desglose.slice(0, 6).map((x) => (
                <li key={x.nombre} className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 truncate">{x.nombre}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-brand-soft"><span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(2, (x.monto / (desglose[0].monto || 1)) * 100)}%` }} /></span>
                  <span className="w-28 shrink-0 text-right tabular-nums">{dinero(x.monto, s.moneda)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {d.gastos.length === 0 ? <Vacio>No hay gastos con estos filtros.</Vacio> : (
        <Tabla>
          <thead><tr><Th>Fecha</Th><Th>Concepto</Th><Th>Categoría</Th><Th>Cuenta</Th><Th>Monto</Th><Th>Base</Th></tr></thead>
          <tbody>
            {d.gastos.map((g) => (
              <tr key={g.id} className={`hover:bg-brand-soft/50 ${g.estado === "CANCELADO" ? "opacity-50" : ""}`}>
                <Td className="whitespace-nowrap">{aIso(g.fecha)}</Td>
                <Td>
                  <Link href={`/gastos/${g.id}`} className={`font-medium text-brand ${g.estado === "CANCELADO" ? "line-through" : ""}`}>{g.concepto}</Link>
                  <span className="block text-xs text-muted">{[g.proveedor, g.embarcacion?.nombre].filter(Boolean).join(" · ")}{g._count.comprobantes > 0 && ` · 📎 ${g._count.comprobantes}`}{g.requiereFactura && " · pedir factura"}</span>
                </Td>
                <Td className="text-xs">{g.categoria?.nombre ?? "—"}{g.origen !== "MANUAL" && <> <Insignia>{ORIGENES_MOVIMIENTO[g.origen]}</Insignia></>}</Td>
                <Td className="text-xs">{g.cuenta.nombre}</Td>
                <Td className="whitespace-nowrap font-medium">{dinero(g.montoCentavos, g.moneda)}</Td>
                <Td className="whitespace-nowrap text-xs text-muted">{g.moneda !== s.moneda ? dinero(g.montoBaseCentavos, s.moneda) : ""}</Td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
