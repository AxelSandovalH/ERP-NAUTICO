import Link from "next/link";
import type { EstadoReserva, Prisma } from "@prisma/client";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { aDate, dinero, esIso, hoyIso } from "@/lib/fechas";
import { minutosAHora } from "@/lib/reservas/disponibilidad";
import { ESTADOS_RESERVA, TONO_RESERVA } from "@/lib/etiquetas";
import { BotonLink, Insignia, PageHeader, Tabla, Td, Th, Vacio } from "@/components/ui";

export const metadata = { title: "Reservas · ERP Náutico" };

export default async function ReservasPage({ searchParams }: { searchParams: Promise<{ estado?: string; desde?: string; q?: string }> }) {
  const sp = await searchParams;
  const s = await requireModulo("reservas");
  const desde = esIso(sp.desde) ? sp.desde : hoyIso(s.zonaHoraria);
  const estado = sp.estado && sp.estado in ESTADOS_RESERVA ? (sp.estado as EstadoReserva) : undefined;
  const q = sp.q?.trim();
  const where: Prisma.ReservaWhereInput = {
    fecha: { gte: aDate(desde) },
    ...(estado ? { estado } : {}),
    ...(q ? { OR: [{ cliente: { nombre: { contains: q, mode: "insensitive" } } }, ...(Number(q) ? [{ folio: Number(q) }] : [])] } : {}),
  };
  const reservas = await withTenant(s.tenantId, (tx) =>
    tx.reserva.findMany({ where, orderBy: [{ fecha: "asc" }, { inicioMin: "asc" }], take: 200, include: { cliente: true, embarcacion: true, pagos: true } }));
  return (
    <>
      <PageHeader titulo="Reservas" sub={`Desde ${desde}`}
        acciones={puede(s.rol, "reservas:escribir") && <BotonLink href="/reservas/nueva">Nueva reserva</BotonLink>} />
      <form className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">Desde<input name="desde" type="date" defaultValue={desde} className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2" /></label>
        <label className="text-sm">Estado
          <select name="estado" defaultValue={estado ?? ""} className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2">
            <option value="">Todos</option>
            {Object.entries(ESTADOS_RESERVA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="text-sm">Cliente o folio<input name="q" defaultValue={q} className="mt-1 block rounded-lg border border-line bg-surface px-3 py-2" /></label>
        <button className="rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-brand-soft">Filtrar</button>
      </form>
      {reservas.length === 0 ? <Vacio>No hay reservas con estos filtros.</Vacio> : (
        <Tabla>
          <thead><tr><Th>Folio</Th><Th>Fecha</Th><Th>Horario</Th><Th>Embarcación</Th><Th>Cliente</Th><Th>Estado</Th><Th>Saldo</Th></tr></thead>
          <tbody>
            {reservas.map((r) => {
              const saldo = r.totalCentavos - r.pagos.reduce((a, p) => a + p.montoCentavos, 0);
              return (
                <tr key={r.id} className="hover:bg-brand-soft/50">
                  <Td><Link href={`/reservas/${r.id}`} className="font-medium text-brand">#{r.folio}</Link></Td>
                  <Td>{r.fecha.toISOString().slice(0, 10)}</Td>
                  <Td>{minutosAHora(r.inicioMin)}–{minutosAHora(r.finMin)}</Td>
                  <Td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.embarcacion.color }} />{r.embarcacion.nombre}</Td>
                  <Td>{r.cliente.nombre}</Td>
                  <Td><Insignia tono={TONO_RESERVA[r.estado]}>{ESTADOS_RESERVA[r.estado]}</Insignia></Td>
                  <Td>{r.estado === "CANCELADA" ? "—" : saldo === 0 ? <Insignia tono="verde">Pagada</Insignia> : dinero(saldo, s.moneda)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
