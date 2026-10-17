import "dotenv/config";
import { prisma } from "../src/lib/db/client";
import { withTenant } from "../src/lib/db/tenant";
import { recalcularComisionReserva } from "../src/lib/comisiones/servicio";
import { asignarTripulanteTx } from "../src/lib/tripulacion/asignar";

// Datos DEMO de tripulación y comisiones para la empresa "cabo-demo" (la crea
// `npm run db:seed`). Es idempotente: si ya hay beneficiarios, no hace nada.
async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "cabo-demo" } });
  if (!tenant) throw new Error('No existe la empresa "cabo-demo": corre primero `npm run db:seed`.');
  const ventas = await prisma.usuario.findUnique({ where: { email: "ventas@demo.test" } });

  await withTenant(tenant.id, async (tx) => {
    if ((await tx.beneficiario.count()) > 0) { console.log("Datos de comisiones ya existen: nada que hacer."); return; }
    const flota = await tx.embarcacion.findMany({ orderBy: { nombre: "asc" } });
    const por = (n: string) => flota.find((e) => e.nombre === n)!;

    // Precio casa: base de las comisiones sobre balance
    await tx.embarcacion.update({ where: { id: por("Sunseeker 80").id }, data: { precioCasaCentavos: 2_500_000, paxIncluidosCasa: 10, extraPaxCasaCentavos: 150_000 } });
    await tx.embarcacion.update({ where: { id: por("Catamarán Luna").id }, data: { precioCasaCentavos: 1_800_000, paxIncluidosCasa: 20, extraPaxCasaCentavos: 80_000 } });

    const mk = (nombre: string, tipo: "VENDEDOR" | "AGENCIA" | "CONCIERGE", usuarioId?: string) =>
      tx.beneficiario.create({ data: { tenantId: tenant.id, nombre, tipo, usuarioId } });
    const victor = await mk("Víctor Ventas", "VENDEDOR", ventas?.id);
    const agencia = await mk("Cabo Tours (agencia)", "AGENCIA");
    const concierge = await mk("Hotel Playa — concierge", "CONCIERGE");

    const t = (beneficiarioId: string, d: { tipo: "FIJO" | "PORCENTAJE" | "PORCENTAJE_BALANCE" | "SIN"; valor?: number; embarcacionId?: string; origen?: "WEB" | "AGENCIA"; umbralPax?: number; valorAlto?: number }) =>
      tx.tarifaComision.create({ data: { tenantId: tenant.id, beneficiarioId, tipo: d.tipo, valor: d.valor ?? 0, embarcacionId: d.embarcacionId, origen: d.origen, umbralPax: d.umbralPax, valorAlto: d.valorAlto } });
    await t(victor.id, { tipo: "PORCENTAJE", valor: 1000 }); // 10 % general
    await t(victor.id, { tipo: "PORCENTAJE_BALANCE", valor: 2000, embarcacionId: por("Sunseeker 80").id }); // 20 % del balance en el yate
    await t(victor.id, { tipo: "SIN", origen: "WEB" }); // lo que entra por la web no comisiona
    await t(agencia.id, { tipo: "FIJO", valor: 80_000, umbralPax: 15, valorAlto: 120_000 }); // $800, o $1,200 desde 15 pax
    await t(concierge.id, { tipo: "PORCENTAJE", valor: 1500 });

    // Tripulación
    const mkT = (nombre: string, apellido: string, rol: "CAPITAN" | "MARINERO" | "GUIA", fijas: string[] = []) =>
      tx.tripulante.create({ data: { tenantId: tenant.id, nombre, apellido, rol, telefono: "+52 624 555 0199", embarcaciones: { create: fijas.map((embarcacionId) => ({ tenantId: tenant.id, embarcacionId })) } } });
    const beto = await mkT("Beto", "Salgado", "CAPITAN", [por("Sunseeker 80").id]);
    const lola = await mkT("Lola", "Mendoza", "CAPITAN", [por("Catamarán Luna").id]);
    const luis = await mkT("Luis", "Ortega", "MARINERO");
    await mkT("Nora", "Ríos", "GUIA");

    // Ligar las reservas demo a un beneficiario, asignar tripulación y calcular comisiones
    const reservas = await tx.reserva.findMany({ orderBy: [{ fecha: "asc" }, { inicioMin: "asc" }], include: { embarcacion: true } });
    const reparto = [victor, agencia, concierge, victor, victor];
    for (const [i, r] of reservas.entries()) {
      await tx.reserva.update({ where: { id: r.id }, data: { beneficiarioId: reparto[i % reparto.length].id } });
      await recalcularComisionReserva(tx, tenant.id, r.id, tenant.moneda);
      const capitan = r.embarcacion.nombre === "Sunseeker 80" ? beto : r.embarcacion.nombre === "Catamarán Luna" ? lola : null;
      if (capitan) await asignarTripulanteTx(tx, tenant.id, { reservaId: r.id, tripulanteId: capitan.id, rol: "CAPITAN" }).catch(() => undefined);
      if (i === 0) await asignarTripulanteTx(tx, tenant.id, { reservaId: r.id, tripulanteId: luis.id, rol: "MARINERO" }).catch(() => undefined);
    }
    console.log("Demo de tripulación y comisiones listo.");
  });
}

main().finally(() => prisma.$disconnect());
