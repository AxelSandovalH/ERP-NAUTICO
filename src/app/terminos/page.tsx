import type { Metadata } from "next";
import Link from "next/link";
import { PaginaLegal } from "@/components/landing/legal";
import { CONTACTO } from "@/components/landing/contacto";
import { DIAS_PRUEBA } from "@/lib/suscripcion/prueba";
import { TASA_CARGO, TASA_IVA_SUSCRIPCION } from "@/lib/stripe/suscripcion";

export const metadata: Metadata = { title: "Términos y condiciones · FleetNautic", description: "Condiciones de uso y contratación del servicio FleetNautic.", alternates: { canonical: "/terminos" } };

export default function Terminos() {
  return (
    <PaginaLegal titulo="Términos y condiciones" actualizado="19 de octubre de 2026">
      <section>
        <h2>1. Aceptación</h2>
        <p>Al crear una cuenta o usar FleetNautic aceptas estos términos y el <Link href="/privacidad">Aviso de privacidad</Link>. Si usas el servicio en nombre de una empresa, declaras tener facultades para obligarla.</p>
      </section>
      <section>
        <h2>2. El servicio</h2>
        <p>FleetNautic es un software en línea (SaaS) para operadores náuticos que incluye módulos de reservas, flota, equipo, finanzas, inventario, transporte, facturación y reportes. Los módulos disponibles dependen del plan contratado.</p>
      </section>
      <section>
        <h2>3. Prueba gratuita</h2>
        <p>Las cuentas nuevas disfrutan de {DIAS_PRUEBA} días de prueba con todos los módulos, sin tarjeta. Al terminar, si no contratas un plan, los módulos se pausan y solo quedan el panel y la configuración; tus datos se conservan para cuando contrates.</p>
      </section>
      <section>
        <h2>4. Planes, precios y pagos</h2>
        <ul>
          <li>Los planes se cobran por mes, en pesos mexicanos, por adelantado y con renovación automática.</li>
          <li>Los precios publicados no incluyen IVA. Sobre el precio del plan se suma un cargo por servicio de pago de {TASA_CARGO * 100} %, y el IVA de {TASA_IVA_SUSCRIPCION * 100} % sobre ambos conceptos.</li>
          <li>Puedes subir de plan en cualquier momento (se cobra la diferencia proporcional del periodo) o bajar de plan (la diferencia queda como saldo a favor).</li>
          <li>Los pagos se procesan mediante Stripe. Si un cobro falla, se reintentará y, de no resolverse, el acceso a los módulos puede suspenderse.</li>
        </ul>
      </section>
      <section>
        <h2>5. Cancelación</h2>
        <p>Puedes cancelar cuando quieras desde la aplicación; el servicio sigue activo hasta el final del periodo ya pagado. No hay reembolsos por periodos parciales ya iniciados, salvo lo que disponga la ley.</p>
      </section>
      <section>
        <h2>6. Tu cuenta y tu información</h2>
        <ul>
          <li>Eres responsable de la confidencialidad de tus credenciales y de la actividad de tus usuarios.</li>
          <li>Eres propietario de la información que capturas. Nos otorgas el permiso necesario para almacenarla y procesarla con el único fin de prestarte el servicio.</li>
          <li>Eres responsable de la veracidad de los datos y de contar con las autorizaciones de las personas cuyos datos registras.</li>
        </ul>
      </section>
      <section>
        <h2>7. Uso aceptable</h2>
        <p>No puedes usar el servicio para fines ilícitos, intentar acceder a información de otras empresas, interferir con su funcionamiento, revenderlo sin autorización ni extraer su contenido de forma automatizada.</p>
      </section>
      <section>
        <h2>8. Facturación e información fiscal</h2>
        <p>La emisión de CFDI se realiza mediante un proveedor externo y requiere que tu empresa complete su alta fiscal. Eres responsable de la exactitud de tus datos fiscales y del cumplimiento de tus obligaciones tributarias; FleetNautic es una herramienta y no sustituye el asesoramiento de un contador.</p>
      </section>
      <section>
        <h2>9. Disponibilidad y soporte</h2>
        <p>Trabajamos para mantener el servicio disponible, pero no garantizamos que sea ininterrumpido ni libre de errores. Podrá haber mantenimientos y mejoras. El soporte se brinda por correo, llamada o WhatsApp.</p>
      </section>
      <section>
        <h2>10. Limitación de responsabilidad</h2>
        <p>En la medida permitida por la ley, FleetNautic no responde por pérdidas indirectas o lucro cesante, y su responsabilidad total se limita a lo que hayas pagado por el servicio en los 3 meses anteriores al hecho que la origine.</p>
      </section>
      <section>
        <h2>11. Cambios</h2>
        <p>Podemos modificar estos términos o los precios avisando con anticipación razonable por correo o dentro de la aplicación. Si continúas usando el servicio después del cambio, lo aceptas; si no, puedes cancelar.</p>
      </section>
      <section>
        <h2>12. Ley aplicable</h2>
        <p>Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para su interpretación, las partes se someten a los tribunales competentes del domicilio de FleetNautic, renunciando a cualquier otro fuero.</p>
      </section>
      <section>
        <h2>13. Contacto</h2>
        <p><a href={`mailto:${CONTACTO.email}`}>{CONTACTO.email}</a> · {CONTACTO.telefonoVisible} (llamadas y WhatsApp).</p>
      </section>
    </PaginaLegal>
  );
}
