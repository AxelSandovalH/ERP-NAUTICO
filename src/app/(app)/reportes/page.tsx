import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth/session";
import { seccionesDe } from "@/modules/registry";

// «Reportes» es una sección con cuatro reportes: entra al primero que esta empresa y este rol pueden ver
export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ rango?: string }> }) {
  const q = await searchParams;
  const s = await requireModulo("reportes", "reportes:ver");
  const sec = seccionesDe(s.modulos, s.rol).flat().find((x) => x.id === "reportes");
  if (!sec) redirect("/dashboard?aviso=modulo-no-disponible");
  redirect(q.rango ? `${sec.href}?rango=${encodeURIComponent(q.rango)}` : sec.href);
}
