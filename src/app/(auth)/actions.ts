"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { origenActual } from "@/lib/origen";
import { MODULOS_POR_PLAN } from "@/modules/registry";
import type { EstadoForm } from "@/components/formulario";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export async function login(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = loginSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Correo o contraseña inválidos." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(p.data);
  if (error || !data.user) {
    // Mismo mensaje para credenciales malas o correo sin confirmar: no revelar cuentas
    return { error: "Correo o contraseña incorrectos, o el correo aún no está confirmado." };
  }
  const u = await prisma.usuario.findUnique({ where: { supabaseId: data.user.id }, include: { tenant: true } });
  if (!u || !u.activo || !u.tenant.activo) {
    await supabase.auth.signOut();
    return { error: "Tu cuenta no está activa. Contacta a tu administrador." };
  }
  redirect("/dashboard");
}

const registroSchema = z.object({
  empresa: z.string().trim().min(2, "Escribe el nombre de tu empresa").max(80),
  nombre: z.string().trim().min(2, "Escribe tu nombre").max(80),
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(72),
});

function slugDe(nombre: string) {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "empresa";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function registrar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = registroSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: p.data.email,
    password: p.data.password,
    options: {
      data: { nombre: p.data.nombre },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  const authUser = data.user;
  // Con confirmación de correo activa, un correo ya registrado devuelve un
  // usuario "ofuscado" sin identidades en lugar de un error.
  if (!authUser || (authUser.identities?.length ?? 0) === 0) return { error: "Ya existe una cuenta con ese correo." };

  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { nombre: p.data.empresa, slug: slugDe(p.data.empresa), plan: "PRUEBA", modulos: MODULOS_POR_PLAN.PRUEBA },
      });
      await tx.usuario.create({
        data: { tenantId: tenant.id, supabaseId: authUser.id, email: p.data.email, nombre: p.data.nombre, rol: "ADMIN" },
      });
    });
  } catch (e) {
    // Que no quede un usuario de Auth huérfano sin empresa
    await createAdminClient().auth.admin.deleteUser(authUser.id);
    throw e;
  }

  if (!data.session) return { ok: "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión." };
  redirect("/dashboard");
}

export async function salir() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function entrarConGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origenActual()}/auth/callback`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

const onboardingSchema = z.object({ empresa: z.string().trim().min(2, "Escribe el nombre de tu empresa").max(80) });

/** Alta de empresa para quien entró con Google y aún no tiene cuenta en el ERP. */
export async function crearEmpresaOnboarding(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = onboardingSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const au = data.user;
  if (!au?.email) redirect("/login");
  if (await prisma.usuario.findUnique({ where: { supabaseId: au.id } })) redirect("/dashboard");

  const meta = au.user_metadata as { full_name?: string; name?: string };
  const nombre = (meta.full_name ?? meta.name ?? au.email.split("@")[0]).trim().slice(0, 80) || "Administrador";
  try {
    await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { nombre: p.data.empresa, slug: slugDe(p.data.empresa), plan: "PRUEBA", modulos: MODULOS_POR_PLAN.PRUEBA },
      });
      await tx.usuario.create({ data: { tenantId: tenant.id, supabaseId: au.id, email: au.email!.toLowerCase(), nombre, rol: "ADMIN" } });
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      return { error: "Ya existe una cuenta con ese correo. Inicia sesión con tu contraseña." };
    throw e;
  }
  redirect("/dashboard");
}
