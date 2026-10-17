import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { createClient } from "@/lib/supabase/server";
import type { RolUsuario } from "@prisma/client";
import { modulosEfectivos, type ModuloId } from "@/modules/registry";
import { puede, type Permiso } from "@/modules/permisos";

export type Sesion = {
  usuarioId: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  tenantId: string;
  tenantNombre: string;
  moneda: string;
  zonaHoraria: string;
  modulos: ModuloId[];
};

/** Sesión actual: Supabase Auth valida el token (getUser consulta al servidor de
 *  Auth, no confía solo en la cookie) y luego se resuelve el usuario/tenant en
 *  nuestra BD, exigiendo que ambos estén activos. Memoizada por request. */
export const getSesion = cache(async (): Promise<Sesion | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const u = await prisma.usuario.findUnique({ where: { supabaseId: data.user.id }, include: { tenant: true } });
  if (!u || !u.activo || !u.tenant.activo) return null;
  return {
    usuarioId: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    tenantId: u.tenantId,
    tenantNombre: u.tenant.nombre,
    moneda: u.tenant.moneda,
    zonaHoraria: u.tenant.zonaHoraria,
    // El plan es el tope: bajar de plan quita módulos aunque sigan marcados en la empresa
    modulos: modulosEfectivos(u.tenant.plan, u.tenant.modulos),
  };
});

export async function requireSesion(): Promise<Sesion> {
  const s = await getSesion();
  if (!s) redirect("/login");
  return s;
}

/** Exige sesión + módulo activo en el plan del tenant (+ permiso opcional). */
export async function requireModulo(modulo: ModuloId, permiso?: Permiso): Promise<Sesion> {
  const s = await requireSesion();
  if (!s.modulos.includes(modulo)) redirect("/dashboard?aviso=modulo-no-disponible");
  if (permiso && !puede(s.rol, permiso)) redirect("/dashboard?aviso=sin-permiso");
  return s;
}
