import { requireSesion } from "@/lib/auth/session";
import { navDe } from "@/modules/registry";
import { ShellApp } from "@/components/shell-app";
import Link from "next/link";
import { puede } from "@/modules/permisos";
import { salir } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSesion();
  return (
    <ShellApp nav={navDe(s.modulos, s.rol)} tenantNombre={s.tenantNombre} usuarioNombre={s.nombre} salir={salir}>
      {(s.estadoSuscripcion === "PAGO_PENDIENTE" || s.estadoSuscripcion === "CANCELADA") && puede(s.rol, "usuarios:administrar") && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {s.estadoSuscripcion === "PAGO_PENDIENTE" ? "No pudimos cobrar tu suscripción." : "Tu suscripción terminó y tus módulos están pausados."}{" "}
          <Link href="/configuracion" className="font-medium underline">Resolver en Configuración</Link>
        </p>
      )}
      {children}
    </ShellApp>
  );
}
