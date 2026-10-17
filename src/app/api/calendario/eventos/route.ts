import { NextResponse, type NextRequest } from "next/server";
import { getSesion } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { esIso } from "@/lib/fechas";
import { fetchEventos } from "@/lib/calendario/eventos";

// GET /api/calendario/eventos?start=YYYY-MM-DD&end=YYYY-MM-DD (fin exclusivo)
export async function GET(request: NextRequest) {
  const s = await getSesion();
  if (!s || !s.modulos.includes("calendario")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const start = request.nextUrl.searchParams.get("start")?.slice(0, 10);
  const end = request.nextUrl.searchParams.get("end")?.slice(0, 10);
  if (!esIso(start) || !esIso(end) || end <= start) return NextResponse.json({ error: "Rango inválido" }, { status: 400 });
  // Tope de 400 días: evita pedir años enteros de un jalón
  if ((Date.parse(end) - Date.parse(start)) / 86_400_000 > 400) return NextResponse.json({ error: "Rango demasiado grande" }, { status: 400 });
  const eventos = await withTenant(s.tenantId, (tx) => fetchEventos(tx, start, end));
  return NextResponse.json(eventos);
}
