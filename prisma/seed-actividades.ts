import "dotenv/config";
import { prisma } from "../src/lib/db/client";
import { withTenant } from "../src/lib/db/tenant";
import { hoyIso, sumarDias } from "../src/lib/fechas";
import { ErrorActividades, guardarActividad, programarSalida, registrarPagoActividad, reservarActividad } from "../src/lib/actividades/servicio";

// Datos DEMO del módulo de actividades para una empresa: 4 actividades, salidas de los próximos 14 días y algunas reservas.
// Uso: npm run db:seed:actividades -- <slug-de-la-empresa>. Idempotente: si ya hay actividades, no hace nada.
const ACTIVIDADES = [
  { nombre: "Snorkel en catamarán", descripcion: "Salida en catamarán a una bahía de aguas claras. Incluye equipo de snorkel, chaleco, bebidas y botana.", horas: 4, precio: 1200, cupo: 20, color: "#0ea5e9", punto: "Muelle principal, Marina", hora: 10 * 60, barco: /catam/i },
  { nombre: "Avistamiento de ballenas", descripcion: "Recorrido de 3 horas con guía naturalista para ver ballenas en temporada. Incluye bebidas.", horas: 3, precio: 1500, cupo: 12, color: "#8b5cf6", punto: "Muelle principal, Marina", hora: 8 * 60 + 30, barco: /yate|sunseeker/i },
  { nombre: "Pesca deportiva compartida", descripcion: "Salida de pesca con capitán y equipo incluido. Los lugares se comparten con otros pescadores.", horas: 6, precio: 2200, cupo: 6, color: "#f59e0b", punto: "Muelle de pesca", hora: 6 * 60, barco: /lancha|marl/i },
  { nombre: "Atardecer con cena a bordo", descripcion: "Navegación al atardecer con cena de tres tiempos y bebidas. Ambiente tranquilo, ideal para parejas y grupos.", horas: 3, precio: 1800, cupo: 24, color: "#db2777", punto: "Muelle principal, Marina", hora: 16 * 60 + 30, barco: /catam/i },
] as const;

const SEMILLA = 2026;
let estado = SEMILLA;
const rnd = () => { estado = (estado * 1664525 + 1013904223) % 4294967296; return estado / 4294967296; };

async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error("Indica la empresa: npm run db:seed:actividades -- <slug>");
  const t = await prisma.tenant.findUnique({ where: { slug } });
  if (!t) throw new Error(`No existe la empresa "${slug}".`);
  const hoy = hoyIso(t.zonaHoraria);

  const base = await withTenant(t.id, async (tx) => {
    if ((await tx.actividad.count()) > 0) return null;
    const flota = await tx.embarcacion.findMany({ where: { estado: "ACTIVA" } });
    let guias = await tx.tripulante.findMany({ where: { activo: true, rol: "GUIA" } });
    if (guias.length === 0) guias = await Promise.all([["Mario", "Ríos"], ["Sofía", "Luna"]].map(([nombre, apellido]) => tx.tripulante.create({ data: { tenantId: t.id, nombre, apellido, rol: "GUIA" } })));
    let clientes = await tx.cliente.findMany({ take: 20 });
    if (clientes.length < 8) clientes = [...clientes, ...await Promise.all(["Laura Gómez", "John Miller", "Sophie Martin", "Carlos Herrera", "Ana Beltrán", "Mike Thompson", "Emma Wilson", "David Brown"].map((nombre) => tx.cliente.create({ data: { tenantId: t.id, nombre } })))];
    const acts = [];
    for (const a of ACTIVIDADES) acts.push(await guardarActividad(tx, t.id, null, { nombre: a.nombre, descripcion: a.descripcion, duracionMin: a.horas * 60, precioCentavos: a.precio * 100, cupo: a.cupo, color: a.color, puntoEncuentro: a.punto }));
    return { flota, guias, clientes, acts };
  }, { timeoutMs: 60_000 });
  if (!base) { console.log("La empresa ya tiene actividades: nada que hacer."); return; }

  let salidas = 0, omitidas = 0, reservas = 0, pagos = 0;
  for (let d = 0; d < 14; d++) {
    const fecha = sumarDias(hoy, d);
    for (const [i, a] of ACTIVIDADES.entries()) {
      // No todos los días: la pesca y las ballenas salen casi diario; el atardecer más seguido en fin de semana
      if (rnd() > 0.82) continue;
      const barco = base.flota.find((b) => a.barco.test(b.nombre)) ?? null;
      const guia = base.guias[(d + i) % base.guias.length];
      try {
        await withTenant(t.id, async (tx) => {
          const s = await programarSalida(tx, t.id, { actividadId: base.acts[i].id, fecha, inicioMin: a.hora, cupo: barco ? Math.min(a.cupo, barco.capacidad) : a.cupo, embarcacionId: barco?.id, guiaId: guia.id });
          salidas++;
          // Apartan entre 30 % y 95 % del cupo, en reservas de 2 a 5 personas
          let objetivo = Math.round(s.cupo * (0.3 + rnd() * 0.65));
          while (objetivo > 0) {
            const pax = Math.min(objetivo, 2 + Math.floor(rnd() * 4));
            const r = await reservarActividad(tx, t.id, { salidaId: s.id, pax, clienteId: base.clientes[Math.floor(rnd() * base.clientes.length)].id, origen: (["DIRECTO", "WEB", "AGENCIA", "CONCIERGE"] as const)[Math.floor(rnd() * 4)] });
            reservas++; objetivo -= pax;
            if (rnd() < 0.55) {
              const total = r.totalCentavos;
              const monto = rnd() < 0.5 ? total : Math.round(total * 0.5 / 100) * 100;
              await registrarPagoActividad(tx, t.id, { reservaId: r.id, montoCentavos: monto, metodo: (["TRANSFERENCIA", "TARJETA", "EFECTIVO"] as const)[Math.floor(rnd() * 3)] });
              pagos++;
            }
          }
        }, { timeoutMs: 60_000 });
      } catch (e) {
        if (e instanceof ErrorActividades) omitidas++; else throw e;
      }
    }
  }
  console.log(`Demo de actividades listo: ${base.acts.length} actividades, ${salidas} salidas (${omitidas} omitidas por empalmes con rentas), ${reservas} reservas, ${pagos} pagos.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
