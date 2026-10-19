import { ImageResponse } from "next/og";

export const alt = "FleetNautic · Software para operadores náuticos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagen de vista previa (redes, buscadores y herramientas que leen la URL como producto). */
export default function Imagen() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg,#0B132B 0%,#0B132B 55%,#0e4f5a 100%)", color: "#fff" }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#00B7BD" }}>FleetNautic</div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>Tu operación náutica, bajo control</div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 32, color: "#cbd5e1" }}>Reservas, flota, equipo, finanzas, inventario y facturación en un solo sistema.</div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 28, color: "#00B7BD" }}>Prueba gratis 7 días · fleetnautic.com</div>
      </div>
    ),
    size,
  );
}
