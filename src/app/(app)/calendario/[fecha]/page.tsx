import { redirect } from "next/navigation";
import { esIso } from "@/lib/fechas";

// Enlaces antiguos /calendario/2026-10-17 → vista de día del calendario operativo
export default async function DiaRedirect({ params }: { params: Promise<{ fecha: string }> }) {
  const { fecha } = await params;
  redirect(esIso(fecha) ? `/calendario?vista=timeGridDay&fecha=${fecha}` : "/calendario");
}
