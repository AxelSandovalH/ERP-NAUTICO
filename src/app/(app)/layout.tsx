import { requireSesion } from "@/lib/auth/session";
import { seccionesDe } from "@/modules/registry";
import { ShellApp } from "@/components/shell-app";
import Link from "next/link";
import { puede } from "@/modules/permisos";
import { urlFoto } from "@/lib/storage/reglas";
import { salir } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSesion();
  return (
    <ShellApp grupos={seccionesDe(s.modulos, s.rol)} tenantNombre={s.tenantNombre} usuarioNombre={s.nombre} usuarioFoto={urlFoto(s.fotoRuta)} puedeConfigurar={puede(s.rol, "usuarios:administrar")} salir={salir}>
      {s.prueba && !s.prueba.vencida && puede(s.rol, "usuarios:administrar") && (
        <p role="status" className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-950 dark:text-sky-200">
          Prueba gratuita: te {s.prueba.diasRestantes === 1 ? "queda 1 día" : `quedan ${s.prueba.diasRestantes} días`}.{" "}
          <Link href="/configuracion" className="font-medium underline">Elige un plan para no perder el acceso</Link>
        </p>
      )}
      {s.prueba?.vencida && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          La prueba gratuita terminó y tus módulos están pausados; tus datos se conservan.{" "}
          {puede(s.rol, "usuarios:administrar") ? <Link href="/configuracion" className="font-medium underline">Elige un plan en Configuración</Link> : "Pídele a un administrador que elija un plan."}
        </p>
      )}
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
