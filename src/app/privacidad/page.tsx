import type { Metadata } from "next";
import { PaginaLegal } from "@/components/landing/legal";
import { CONTACTO } from "@/components/landing/contacto";

export const metadata: Metadata = { title: "Aviso de privacidad · FleetNautic", description: "Cómo FleetNautic recaba, usa y protege tus datos personales.", alternates: { canonical: "/privacidad" } };

export default function Privacidad() {
  return (
    <PaginaLegal titulo="Aviso de privacidad" actualizado="19 de octubre de 2026">
      <section>
        <h2>1. Responsable</h2>
        <p>FleetNautic (en adelante, “FleetNautic”) es responsable del tratamiento de tus datos personales, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP). Para cualquier asunto de privacidad escríbenos a <a href={`mailto:${CONTACTO.email}`}>{CONTACTO.email}</a> o comunícate al {CONTACTO.telefonoVisible} (llamadas y WhatsApp).</p>
      </section>
      <section>
        <h2>2. Datos que recabamos</h2>
        <ul>
          <li>Datos de cuenta: nombre, correo electrónico, nombre de tu empresa y contraseña (gestionada por un servicio de autenticación; no la conocemos).</li>
          <li>Datos que tú capturas en el sistema: embarcaciones, reservas, clientes, equipo, asistencia, gastos, ingresos, inventario, traslados y documentos fiscales.</li>
          <li>Datos de ubicación, solo cuando tu empresa activa la checada de asistencia por ubicación y tú la realizas.</li>
          <li>Datos de facturación de tu suscripción. Los datos de tarjeta los procesa directamente nuestro procesador de pagos; FleetNautic no los almacena.</li>
          <li>Datos técnicos de uso (tipo de dispositivo, registros de errores) para mantener el servicio.</li>
        </ul>
      </section>
      <section>
        <h2>3. Para qué los usamos</h2>
        <ul>
          <li>Crear y administrar tu cuenta y prestarte el servicio contratado.</li>
          <li>Cobrar tu suscripción y emitir los comprobantes que correspondan.</li>
          <li>Brindarte soporte y comunicarte avisos del servicio.</li>
          <li>Mantener la seguridad, prevenir fraudes y mejorar el producto.</li>
        </ul>
        <p>No vendemos tus datos ni los usamos para publicidad de terceros.</p>
      </section>
      <section>
        <h2>4. Datos de tus clientes y tu equipo</h2>
        <p>La información de tus clientes, tripulación y proveedores que capturas en FleetNautic es de tu responsabilidad: tú decides qué datos registrar y debes contar con el aviso de privacidad y el consentimiento que correspondan. FleetNautic la trata únicamente por tu cuenta, para prestarte el servicio, y cada empresa solo puede ver su propia información.</p>
      </section>
      <section>
        <h2>5. Con quién los compartimos</h2>
        <p>Solo con proveedores que hacen posible el servicio, bajo obligaciones de confidencialidad: alojamiento e infraestructura, autenticación, procesamiento de pagos (Stripe), correo electrónico, emisión de facturas CFDI (Procura) y, cuando lo activas, lectura automática de comprobantes. También podremos divulgarlos cuando una autoridad competente lo exija.</p>
      </section>
      <section>
        <h2>6. Tus derechos (ARCO)</h2>
        <p>Puedes acceder a tus datos, rectificarlos, cancelarlos u oponerte a su tratamiento, así como revocar tu consentimiento. Envía tu solicitud a <a href={`mailto:${CONTACTO.email}`}>{CONTACTO.email}</a> indicando tu nombre, el derecho que deseas ejercer y los datos a los que se refiere; responderemos en un máximo de 20 días hábiles.</p>
      </section>
      <section>
        <h2>7. Conservación y seguridad</h2>
        <p>Conservamos tus datos mientras tengas una cuenta y el tiempo que exijan las obligaciones fiscales y legales. Aplicamos medidas técnicas y administrativas, como aislamiento de la información por empresa en la base de datos, cifrado en tránsito y control de accesos por rol.</p>
      </section>
      <section>
        <h2>8. Cookies</h2>
        <p>Usamos únicamente cookies necesarias para mantener tu sesión iniciada. No usamos cookies de publicidad.</p>
      </section>
      <section>
        <h2>9. Cambios a este aviso</h2>
        <p>Podemos actualizar este aviso; publicaremos la versión vigente en esta página con su fecha de actualización.</p>
      </section>
    </PaginaLegal>
  );
}
