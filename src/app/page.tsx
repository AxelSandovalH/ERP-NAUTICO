import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/auth/session";
import { Landing } from "@/components/landing/landing";

export const metadata: Metadata = {
  title: "FleetNautic · Software para operadores náuticos",
  description: "Reservas, calendario, tripulación, nómina, finanzas, inventario, transporte y facturación para charters, tours y renta de embarcaciones. Prueba gratis 7 días.",
  alternates: { canonical: "/" },
  twitter: { card: "summary_large_image", title: "FleetNautic · Tu operación náutica, bajo control", description: "Todo lo que necesita un operador náutico en un solo sistema. Prueba gratis 7 días, sin tarjeta." },
  openGraph: { url: "/", siteName: "FleetNautic", title: "FleetNautic · Tu operación náutica, bajo control", description: "Todo lo que necesita un operador náutico en un solo sistema. Prueba gratis 7 días, sin tarjeta.", type: "website", locale: "es_MX" },
};

// Quien ya inició sesión entra directo a su panel; los visitantes ven la landing
export default async function Home() {
  if (await getSesion()) redirect("/dashboard");
  return <Landing />;
}
