import { requireSesion } from "@/lib/auth/session";
import { navDe } from "@/modules/registry";
import { ShellApp } from "@/components/shell-app";
import { salir } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSesion();
  return (
    <ShellApp nav={navDe(s.modulos, s.rol)} tenantNombre={s.tenantNombre} usuarioNombre={s.nombre} salir={salir}>
      {children}
    </ShellApp>
  );
}
