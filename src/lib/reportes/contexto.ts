import "server-only";
import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { hoyIso } from "@/lib/fechas";
import type { ModuloId } from "@/modules/registry";
import { RANGO_POR_DEFECTO, esRango, periodoDe, type RangoId } from "./rangos";

/** Sesión, periodo y permisos de una página de reportes. `modulo` es el que alimenta ese reporte (reservas, gastos, ingresos, transporte). */
export async function contextoReporte(sp: Promise<{ rango?: string }>, modulo: ModuloId) {
  const q = await sp;
  const s = await requireModulo(modulo, "reportes:ver");
  if (!s.modulos.includes("reportes")) redirect("/dashboard?aviso=modulo-no-disponible");
  const id: RangoId = esRango(q.rango) ? q.rango : RANGO_POR_DEFECTO;
  return { s, id, periodo: periodoDe(id, hoyIso(s.zonaHoraria)) };
}
