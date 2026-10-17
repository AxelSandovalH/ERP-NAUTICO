import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";


const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ERP Náutico",
  description: "ERP modular para operadores náuticos: flota, reservas y calendario.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={geist.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
