import { NextResponse, type NextRequest } from "next/server";
import { getSesion } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { aDate, aIso, esIso } from "@/lib/fechas";
import type { Ocupado } from "@/lib/calendario/ventanas-disponibilidad";
import { hhmm } from "@/lib/calendario/mapear";

export type BarcoDisponibilidad = {
  id: string;
  nombre: string;
  capacidad: number;
  color: string;
  /** Duración del tour más corto activo, en minutos (null si no tiene tarifas) */
  duracionBaseMin: number | null;
  bloqueadoTodoElDia: boolean;
  ocupado: Ocupado[];
};

// GET /api/calendario/disponibilidad?fecha=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const s = await getSesion();
  if (!s || !s.modulos.includes("calendario")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const fecha = request.nextUrl.searchParams.get("fecha");
  if (!esIso(fecha)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });

  const barcos = await withTenant(s.tenantId, async (tx) => {
    // Secuencial: una transacción usa un solo cliente de pg (ver eventos.ts)
    const flota = await tx.embarcacion.findMany({
      where: { estado: "ACTIVA" }, orderBy: { nombre: "asc" },
      include: { tarifas: { where: { activa: true }, select: { duracionMin: true } } },
    });
    const reservas = await tx.reserva.findMany({ where: { fecha: aDate(fecha), estado: { not: "CANCELADA" } }, include: { cliente: true } });
    const bloqueos = await tx.bloqueoEmbarcacion.findMany({ where: { desde: { lte: aDate(fecha) }, hasta: { gte: aDate(fecha) } } });
    const salidas = await tx.salidaActividad.findMany({ where: { fecha: aDate(fecha), estado: { not: "CANCELADA" }, embarcacionId: { not: null } }, include: { actividad: { select: { nombre: true } } } });
    return flota.map<BarcoDisponibilidad>((e) => {
      const bl = bloqueos.filter((b) => b.embarcacionId === e.id);
      const ocupado: Ocupado[] = reservas
        .filter((r) => r.embarcacionId === e.id)
        .map((r) => ({ ini: r.inicioMin, fin: r.finMin, tipo: "RESERVA", label: `${hhmm(r.inicioMin)}–${hhmm(r.finMin)} ${r.cliente.nombre}` }));
      const deActividades: Ocupado[] = salidas
        .filter((x) => x.embarcacionId === e.id)
        .map((x) => ({ ini: x.inicioMin, fin: x.finMin, tipo: "RESERVA", label: `${hhmm(x.inicioMin)}–${hhmm(x.finMin)} ${x.actividad.nombre}` }));
      return {
        id: e.id, nombre: e.nombre, capacidad: e.capacidad, color: e.color,
        duracionBaseMin: e.tarifas.length ? Math.min(...e.tarifas.map((t) => t.duracionMin)) : null,
        bloqueadoTodoElDia: bl.length > 0,
        ocupado: [...ocupado, ...deActividades, ...bl.map<Ocupado>((b) => ({ ini: 0, fin: 24 * 60, tipo: "BLOQUEO", label: `${aIso(b.desde)}→${aIso(b.hasta)} ${b.motivo}` }))],
      };
    });
  });
  return NextResponse.json({ fecha, barcos });
}
