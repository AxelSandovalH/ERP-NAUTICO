import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { puede } from "@/modules/permisos";
import { esIso, hoyIso, mesDe, sumarDias, sumarMeses } from "@/lib/fechas";
import { fetchEventos } from "@/lib/calendario/eventos";
import { CalendarioOperativo } from "@/components/calendario/calendario-operativo";

export const metadata = { title: "Calendario operativo · ERP Náutico" };

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ vista?: string; fecha?: string }> }) {
  const sp = await searchParams;
  const s = await requireModulo("calendario");
  // Ventana inicial: mes actual + el siguiente (anclada a la zona del negocio;
  // en UTC el fin de mes por la tarde ya sería "mes siguiente")
  const mes = mesDe(hoyIso(s.zonaHoraria));
  // La cuadrícula del mes arranca en el lunes anterior al día 1: se cubren 7 días de más
  const ventana = { start: sumarDias(`${mes}-01`, -7), end: sumarDias(`${sumarMeses(mes, 2)}-01`, 7) };
  const { eventos, flota } = await withTenant(s.tenantId, async (tx) => ({
    eventos: await fetchEventos(tx, ventana.start, ventana.end),
    flota: await tx.embarcacion.findMany({
      where: { estado: { not: "INACTIVA" } }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, color: true },
    }),
  }));
  return (
    <div className="h-[calc(100dvh-3rem)] min-h-[560px]">
      <CalendarioOperativo
        eventosIniciales={eventos}
        ventana={ventana}
        flota={flota}
        puedeCrear={puede(s.rol, "reservas:escribir")}
        moneda={s.moneda}
        vistaInicial={sp.vista ?? "dayGridMonth"}
        fechaInicial={esIso(sp.fecha) ? sp.fecha : undefined}
      />
    </div>
  );
}
