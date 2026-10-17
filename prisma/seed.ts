import "dotenv/config";
import { prisma } from "../src/lib/db/client";
import { withTenant } from "../src/lib/db/tenant";
import { createClient } from "@supabase/supabase-js";
import { crearReservaTx } from "../src/lib/reservas/crear";
import { MODULOS_POR_PLAN } from "../src/modules/registry";
import { aDate, hoyIso, sumarDias } from "../src/lib/fechas";

// Datos de DEMO: usuarios en Supabase Auth + empresa de ejemplo. Requiere
// NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.
// Credenciales demo: admin@demo.test / demo-password-123
const PASSWORD_DEMO = "demo-password-123";

async function asegurarUsuarioAuth(email: string, nombre: string): Promise<string> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD_DEMO, email_confirm: true, user_metadata: { nombre },
  });
  if (data?.user) return data.user.id;
  // Ya existía en Auth (p. ej. seed interrumpido): lo reutilizamos
  for (let page = 1; page < 50; page++) {
    const { data: lista } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const u = lista?.users.find((x) => x.email === email);
    if (u) return u.id;
    if (!lista?.users.length) break;
  }
  throw new Error(`No se pudo crear/encontrar ${email} en Supabase Auth: ${error?.message}`);
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env");
  const email = "admin@demo.test";
  if (await prisma.usuario.findUnique({ where: { email } })) {
    console.log("Seed ya aplicado (admin@demo.test existe).");
    return;
  }
  const tenant = await prisma.tenant.create({
    data: { nombre: "Cabo Demo Charters", slug: "cabo-demo", plan: "ENTERPRISE", modulos: MODULOS_POR_PLAN.ENTERPRISE },
  });
  const admin = await prisma.usuario.create({
    data: { tenantId: tenant.id, email, nombre: "Ana Demo", rol: "ADMIN", supabaseId: await asegurarUsuarioAuth(email, "Ana Demo") },
  });
  await prisma.usuario.create({
    data: { tenantId: tenant.id, email: "ventas@demo.test", nombre: "Víctor Ventas", rol: "VENDEDOR", supabaseId: await asegurarUsuarioAuth("ventas@demo.test", "Víctor Ventas") },
  });

  await withTenant(tenant.id, async (tx) => {
    const flota = [
      { nombre: "Sunseeker 80", tipo: "YATE", capacidad: 12, esloraPies: 80, color: "#0369a1", tarifas: [["Tour 4 horas", 4, 38000], ["Atardecer 3 horas", 3, 29000]] },
      { nombre: "Catamarán Luna", tipo: "CATAMARAN", capacidad: 30, esloraPies: 47, color: "#16a34a", tarifas: [["Snorkel 4 horas", 4, 24000], ["Fiesta 5 horas", 5, 32000]] },
      { nombre: "Velero Brisa", tipo: "VELERO", capacidad: 8, esloraPies: 38, color: "#d97706", tarifas: [["Paseo 3 horas", 3, 12000]] },
    ] as const;
    const embs = [];
    for (const f of flota) {
      const e = await tx.embarcacion.create({
        data: { tenantId: tenant.id, nombre: f.nombre, tipo: f.tipo, capacidad: f.capacidad, esloraPies: f.esloraPies, color: f.color },
      });
      for (const [nombre, h, precio] of f.tarifas)
        await tx.tarifa.create({ data: { tenantId: tenant.id, embarcacionId: e.id, nombre, duracionMin: h * 60, precioCentavos: precio * 100 } });
      embs.push(e);
    }
    const hoy = hoyIso();
    await tx.bloqueoEmbarcacion.create({
      data: { tenantId: tenant.id, embarcacionId: embs[2].id, desde: aDate(sumarDias(hoy, 5)), hasta: aDate(sumarDias(hoy, 7)), motivo: "Mantenimiento de motor" },
    });
    const clientes = await Promise.all(["Laura Gómez", "John Miller", "Familia Ramírez", "Sophie Martin"].map((nombre, i) =>
      tx.cliente.create({ data: { tenantId: tenant.id, nombre, telefono: `+52 624 555 01${i}0`, email: `cliente${i}@example.com` } })));
    const plan = [
      [0, 0, 0, 10, 240, 8, 38000], [1, 1, 0, 9, 300, 20, 32000],
      [0, 2, 1, 16, 180, 4, 29000], [1, 3, 2, 10, 240, 15, 24000], [2, 0, 3, 11, 180, 6, 12000],
    ] as const;
    for (const [e, c, dia, hora, dur, pax, precio] of plan) {
      const r = await crearReservaTx(tx, {
        tenantId: tenant.id, embarcacionId: embs[e].id, clienteId: clientes[c].id, fecha: sumarDias(hoy, dia),
        inicioMin: hora * 60, finMin: hora * 60 + dur, pax, origen: "DIRECTO", totalCentavos: precio * 100, creadorId: admin.id,
      });
      if (dia === 0) {
        await tx.reserva.update({ where: { id: r.id }, data: { estado: "CONFIRMADA" } });
        await tx.pago.create({ data: { tenantId: tenant.id, reservaId: r.id, montoCentavos: Math.round(precio * 50), metodo: "TRANSFERENCIA" } });
      }
    }
  });
  console.log("Seed listo: admin@demo.test / demo-password-123");
}

main().finally(() => prisma.$disconnect());
