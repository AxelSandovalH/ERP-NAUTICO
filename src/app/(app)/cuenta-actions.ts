"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireSesion } from "@/lib/auth/session";
import { borrarFoto, confirmarFoto, prepararFoto } from "@/lib/storage/fotos-servidor";

// Foto de perfil de quien tiene la sesión. Usuario es una tabla de identidad (sin RLS): siempre se filtra por el id de la sesión.

export async function prepararFotoPerfilAccion(a: { mime: string; tamano: number }): Promise<{ error: string } | { ruta: string; token: string }> {
  const s = await requireSesion();
  return prepararFoto(s.tenantId, s.usuarioId, a);
}

export async function confirmarFotoPerfilAccion(ruta: string): Promise<{ error?: string; ok?: true }> {
  const s = await requireSesion();
  const r = await confirmarFoto(s.tenantId, s.usuarioId, ruta, async (nueva) => {
    const u = await prisma.usuario.findUnique({ where: { id: s.usuarioId }, select: { fotoRuta: true } });
    if (!u) return undefined;
    await prisma.usuario.update({ where: { id: s.usuarioId }, data: { fotoRuta: nueva } });
    return u.fotoRuta;
  });
  revalidatePath("/", "layout");
  return r;
}

export async function quitarFotoPerfilAccion(): Promise<{ error?: string; ok?: true }> {
  const s = await requireSesion();
  const u = await prisma.usuario.findUnique({ where: { id: s.usuarioId }, select: { fotoRuta: true } });
  await prisma.usuario.update({ where: { id: s.usuarioId }, data: { fotoRuta: null } });
  await borrarFoto(u?.fotoRuta);
  revalidatePath("/", "layout");
  return { ok: true };
}
