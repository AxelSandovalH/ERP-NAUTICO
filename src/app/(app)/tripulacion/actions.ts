"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModulo } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/tenant";
import { ErrorTripulacion, asignarTripulanteTx } from "@/lib/tripulacion/asignar";
import type { EstadoForm } from "@/components/formulario";

const schema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(80),
  apellido: z.string().trim().max(80).optional(),
  rol: z.enum(["CAPITAN", "MARINERO", "GUIA", "COCINERO", "FOTOGRAFO", "OTRO"]),
  email: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(40).optional(),
  notas: z.string().trim().max(2000).optional(),
});

export async function guardarTripulante(id: string | null, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("tripulacion", "tripulacion:escribir");
  const p = schema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (p.data.email && !z.string().email().safeParse(p.data.email).success) return { error: "Correo inválido." };
  const activo = fd.get("activo") === "on" || id === null;
  const embIds = [...new Set(fd.getAll("embarcacionId").map(String))];

  const resultado = await withTenant(s.tenantId, async (tx) => {
    const validas = embIds.length ? await tx.embarcacion.findMany({ where: { id: { in: embIds } }, select: { id: true } }) : [];
    const data = {
      nombre: p.data.nombre, apellido: p.data.apellido ?? "", rol: p.data.rol, email: p.data.email || null,
      telefono: p.data.telefono || null, notas: p.data.notas || null, activo,
    };
    let tid = id;
    if (tid) {
      const r = await tx.tripulante.updateMany({ where: { id: tid }, data });
      if (r.count === 0) return null;
    } else {
      tid = (await tx.tripulante.create({ data: { ...data, tenantId: s.tenantId } })).id;
    }
    await tx.tripulanteEmbarcacion.deleteMany({ where: { tripulanteId: tid } });
    if (validas.length)
      await tx.tripulanteEmbarcacion.createMany({ data: validas.map((e) => ({ tenantId: s.tenantId, tripulanteId: tid!, embarcacionId: e.id })) });
    return tid;
  });
  if (!resultado) return { error: "Tripulante no encontrado." };
  revalidatePath("/tripulacion");
  if (id === null) redirect(`/tripulacion/${resultado}`);
  return { ok: "Cambios guardados." };
}

const asignarSchema = z.object({
  tripulanteId: z.string().min(1, "Elige un tripulante"),
  rol: z.enum(["CAPITAN", "MARINERO", "GUIA", "COCINERO", "FOTOGRAFO", "OTRO"]),
  horaLlegada: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida").optional().or(z.literal("")),
});

export async function asignarTripulante(reservaId: string, _: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await requireModulo("tripulacion", "tripulacion:asignar");
  const p = asignarSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  try {
    await withTenant(s.tenantId, (tx) => asignarTripulanteTx(tx, s.tenantId, { reservaId, ...p.data }));
  } catch (e) {
    if (e instanceof ErrorTripulacion) return { error: e.message };
    throw e;
  }
  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath("/calendario");
  return { ok: "Tripulante asignado." };
}

export async function quitarTripulante(reservaId: string, tripulanteId: string) {
  const s = await requireModulo("tripulacion", "tripulacion:asignar");
  await withTenant(s.tenantId, (tx) => tx.reservaTripulante.deleteMany({ where: { reservaId, tripulanteId } }));
  revalidatePath(`/reservas/${reservaId}`);
  revalidatePath("/calendario");
}
