import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";


const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FleetNautic",
  description: "Plataforma modular para operadores náuticos: reservas, flota, equipo, finanzas y facturación.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={geist.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
