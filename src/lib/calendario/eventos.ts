import type { Tx } from "@/lib/db/tenant";
import { aDate, aIso, sumarDias } from "@/lib/fechas";
import { fondoClaro } from "./contraste";
import { lugaresOcupados } from "@/lib/actividades/reglas";
import { abreviarOrigen, cobroDe, hhmm, inicioFin, iniciales } from "./mapear";
import type { EventoCal } from "./tipos";

/** Eventos del calendario en [start, end) — fechas "YYYY-MM-DD" del negocio.
 *  Las reservas canceladas no se pintan: liberan el horario. */
export async function fetchEventos(tx: Tx, start: string, end: string): Promise<EventoCal[]> {
  // Secuencial a propósito: una transacción usa UN solo cliente de pg y las
  // consultas simultáneas sobre él están deprecadas (se rompen en pg 9).
  const reservas = await
    tx.reserva.findMany({
      where: { fecha: { gte: aDate(start), lt: aDate(end) }, estado: { not: "CANCELADA" } },
      include: {
        cliente: true, embarcacion: true, creador: true, pagos: { select: { montoCentavos: true } },
        tripulantes: { where: { rol: "CAPITAN" }, include: { tripulante: { select: { nombre: true, apellido: true } } } },
      },
      orderBy: [{ fecha: "asc" }, { inicioMin: "asc" }],
    });
  const bloqueos = await tx.bloqueoEmbarcacion.findMany({
    where: { desde: { lt: aDate(end) }, hasta: { gte: aDate(start) } },
    include: { embarcacion: true },
    orderBy: { desde: "asc" },
  });

  const salidas = await tx.salidaActividad.findMany({
    where: { fecha: { gte: aDate(start), lt: aDate(end) }, estado: { not: "CANCELADA" } },
    include: { actividad: true, embarcacion: true, guia: true, reservas: { select: { pax: true, estado: true } } },
    orderBy: [{ fecha: "asc" }, { inicioMin: "asc" }],
  });

  const deReservas: EventoCal[] = reservas.map((r) => {
    const fecha = aIso(r.fecha);
    const pagado = r.pagos.reduce((a, p) => a + p.montoCentavos, 0);
    const cobro = cobroDe(r.totalCentavos, pagado);
    const color = r.embarcacion.color;
    const abrev = r.creador ? iniciales(r.creador.nombre) : abreviarOrigen(r.origen);
    return {
      id: r.id,
      title: `${r.cliente.nombre} - ${abrev} - ${r.pax} pax`,
      start: inicioFin(fecha, r.inicioMin),
      end: inicioFin(fecha, r.finMin),
      backgroundColor: color,
      borderColor: color,
      extendedProps: {
        tipo: "reserva",
        reservaId: r.id,
        folio: r.folio,
        estado: r.estado,
        embarcacion: r.embarcacion.nombre,
        embarcacionId: r.embarcacionId,
        cliente: r.cliente.nombre,
        telefono: r.cliente.telefono,
        email: r.cliente.email,
        personas: r.pax,
        origen: r.origen,
        vendedor: r.creador?.nombre ?? null,
        vendedorAbrev: abrev,
        cobro,
        totalCentavos: r.totalCentavos,
        pagadoCentavos: pagado,
        horaInicio: hhmm(r.inicioMin),
        horaFin: hhmm(r.finMin),
        notas: r.notas,
        capitan: r.tripulantes[0] ? `${r.tripulantes[0].tripulante.nombre} ${r.tripulantes[0].tripulante.apellido}`.trim() : null,
        sinAnticipo: cobro === "SIN_PAGO" && r.estado !== "COMPLETADA",
        textoOscuro: fondoClaro(color),
      },
    };
  });

  const deBloqueos: EventoCal[] = bloqueos.map((b) => {
    const desde = aIso(b.desde), hasta = aIso(b.hasta);
    const color = b.embarcacion.color; // el color del barco manda: se reconoce de cuál es sin abrirlo
    return {
      id: `bloqueo-${b.id}`,
      title: `Bloqueo · ${b.embarcacion.nombre}`,
      start: desde,
      end: sumarDias(hasta, 1), // fin exclusivo en FullCalendar
      allDay: true,
      backgroundColor: color,
      borderColor: color,
      extendedProps: {
        tipo: "bloqueo",
        bloqueoId: b.id,
        embarcacion: b.embarcacion.nombre,
        embarcacionId: b.embarcacionId,
        motivo: b.motivo,
        desde,
        hasta,
        textoOscuro: fondoClaro(color),
      },
    };
  });

  const deSalidas: EventoCal[] = salidas.map((x) => {
    const fecha = aIso(x.fecha);
    const color = x.actividad.color;
    const ocupados = lugaresOcupados(x.reservas);
    return {
      id: `salida-${x.id}`,
      title: `${x.actividad.nombre} · ${ocupados}/${x.cupo}`,
      start: inicioFin(fecha, x.inicioMin),
      end: inicioFin(fecha, x.finMin),
      backgroundColor: color,
      borderColor: color,
      extendedProps: {
        tipo: "salida",
        salidaId: x.id,
        actividad: x.actividad.nombre,
        actividadId: x.actividadId,
        estado: x.estado === "COMPLETADA" ? "COMPLETADA" : "PROGRAMADA",
        embarcacion: x.embarcacion?.nombre ?? null,
        embarcacionId: x.embarcacionId,
        guia: x.guia ? `${x.guia.nombre} ${x.guia.apellido}`.trim() : null,
        horaInicio: hhmm(x.inicioMin),
        horaFin: hhmm(x.finMin),
        ocupados,
        cupo: x.cupo,
        textoOscuro: fondoClaro(color),
      },
    };
  });

  return [...deReservas, ...deSalidas, ...deBloqueos];
}
