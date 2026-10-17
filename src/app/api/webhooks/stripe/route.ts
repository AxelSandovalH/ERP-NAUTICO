import { prisma } from "@/lib/db/client";
import { stripe } from "@/lib/stripe/cliente";
import { aSuscripcionMin, procesarEventoStripe } from "@/lib/stripe/sincronizar";

// Stripe avisa aquí de cada cambio en las suscripciones. Sin sesión: la autenticidad se prueba con la firma.
export async function POST(request: Request) {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto || !process.env.STRIPE_SECRET_KEY) return new Response("Stripe no está configurado", { status: 503 });

  // La firma se calcula sobre el cuerpo EXACTO: hay que leerlo como texto, sin parsearlo antes
  const cuerpo = await request.text();
  let evento;
  try {
    evento = stripe().webhooks.constructEvent(cuerpo, request.headers.get("stripe-signature") ?? "", secreto);
  } catch {
    return new Response("Firma inválida", { status: 400 });
  }

  try {
    const resultado = await procesarEventoStripe(evento, {
      db: prisma,
      obtenerSuscripcion: async (id) => {
        try { return aSuscripcionMin(await stripe().subscriptions.retrieve(id, { expand: ["items.data.price"] })); }
        catch { return null; }
      },
    });
    console.log(`[stripe] ${evento.type} (${evento.id}) → ${resultado}`);
    return Response.json({ recibido: true });
  } catch (e) {
    // 500: Stripe reintenta el evento más tarde
    console.error(`[stripe] falló ${evento.type} (${evento.id}):`, e);
    return new Response("Error al procesar el evento", { status: 500 });
  }
}
