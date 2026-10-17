"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireSesion } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { puede } from "@/modules/permisos";
import { withTenant } from "@/lib/db/tenant";
import { MODULOS, MODULOS_POR_PLAN, esConstruido, modulosActivos } from "@/modules/registry";
import type { EstadoForm } from "@/components/formulario";

async function admin() {
  const s = await requireSesion();
  if (!puede(s.rol, "usuarios:administrar")) throw new Error("Sin permiso");
  return s;
}

export async function guardarModulos(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const t = await prisma.tenant.findUniqueOrThrow({ where: { id: s.tenantId } });
  const permitidos = new Set<string>(MODULOS_POR_PLAN[t.plan]);
  // Solo módulos incluidos en el plan; el resultado se normaliza con dependencias
  const elegidos = fd.getAll("modulo").map(String).filter((m) => permitidos.has(m) && m in MODULOS && esConstruido(m as keyof typeof MODULOS));
  const final = modulosActivos(elegidos);
  await prisma.tenant.update({ where: { id: s.tenantId }, data: { modulos: final } });
  revalidatePath("/", "layout");
  return { ok: "Módulos actualizados." };
}

const usuarioSchema = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre").max(80),
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200),
  rol: z.enum(["ADMIN", "GERENTE", "VENDEDOR", "OPERACIONES"]),
});

export async function crearUsuario(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const s = await admin();
  const p = usuarioSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  if (await prisma.usuario.findUnique({ where: { email: p.data.email } })) return { error: "Ya existe un usuario con ese correo." };
  // Alta en Supabase Auth (correo ya confirmado: lo da de alta un administrador)
  const supa = createAdminClient();
  const { data, error } = await supa.auth.admin.createUser({
    email: p.data.email, password: p.data.password, email_confirm: true, user_metadata: { nombre: p.data.nombre },
  });
  if (error || !data.user) return { error: error?.message ?? "No se pudo crear el usuario." };
  try {
    const u = await prisma.usuario.create({
      data: { tenantId: s.tenantId, supabaseId: data.user.id, nombre: p.data.nombre, email: p.data.email, rol: p.data.rol },
    });
    // Un vendedor nace con su perfil de comisiones (sin tarifas: un administrador se las asigna)
    if (p.data.rol === "VENDEDOR" && s.modulos.includes("comisiones")) {
      const existe = await withTenant(s.tenantId, (tx) => tx.beneficiario.findFirst({ where: { nombre: p.data.nombre }, select: { id: true } }));
      await withTenant(s.tenantId, (tx) =>
        tx.beneficiario.create({ data: { tenantId: s.tenantId, nombre: existe ? `${p.data.nombre} (${p.data.email})` : p.data.nombre, tipo: "VENDEDOR", usuarioId: u.id } }));
    }
  } catch (e) {
    await supa.auth.admin.deleteUser(data.user.id);
    throw e;
  }
  revalidatePath("/configuracion");
  return { ok: "Usuario creado." };
}

export async function alternarUsuario(usuarioId: string) {
  const s = await admin();
  if (usuarioId === s.usuarioId) return; // no puedes desactivarte a ti mismo
  const u = await prisma.usuario.findFirst({ where: { id: usuarioId, tenantId: s.tenantId } });
  if (!u) return;
  await prisma.usuario.update({ where: { id: u.id }, data: { activo: !u.activo } });
  revalidatePath("/configuracion");
}
