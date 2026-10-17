import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db/client";
import { withTenant } from "../src/lib/db/tenant";
import { aDate, hoyIso, sumarDias } from "../src/lib/fechas";
import { generarNominaPeriodo } from "../src/lib/nomina/servicio";
import { diasEntre, periodoDe } from "../src/lib/nomina/periodos";

// Datos DEMO de nómina y asistencia para la empresa "cabo-demo". Idempotente.
// La ubicación sembrada es una marina de Cabo San Lucas de ejemplo: agrega la tuya
// en Asistencia → Ubicaciones ("Usar mi ubicación actual") para poder checar de verdad.
async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "cabo-demo" } });
  if (!tenant) throw new Error('No existe la empresa "cabo-demo": corre primero `npm run db:seed`.');
  const usuarios = await prisma.usuario.findMany({ where: { tenantId: tenant.id } });
  const uid = (email: string) => usuarios.find((u) => u.email === email)?.id;

  await withTenant(tenant.id, async (tx) => {
    let empleados = await tx.empleado.findMany({ include: { tripulante: { select: { nombre: true } }, usuario: { select: { email: true } } } });
    let ubic = await tx.ubicacionAsistencia.findFirst();
    if (empleados.length === 0) {
      const tripulantes = await tx.tripulante.findMany();
      const trip = (nombre: string) => tripulantes.find((t) => t.nombre === nombre)?.id;
      ubic = await tx.ubicacionAsistencia.create({ data: { tenantId: tenant.id, nombre: "Marina (demo)", lat: 22.8826, lng: -109.9042, radioMetros: 200 } });
      const mk = (d: { nombre: string; apellido?: string; puesto: string; esquema: "FIJO_PERIODO" | "POR_DIA"; sueldo: number; periodicidad?: "QUINCENAL" | "MENSUAL"; usuarioId?: string; tripulanteId?: string }) =>
        tx.empleado.create({ data: { tenantId: tenant.id, nombre: d.nombre, apellido: d.apellido ?? "", puesto: d.puesto, esquema: d.esquema, sueldoCentavos: d.sueldo * 100, periodicidad: d.periodicidad ?? "QUINCENAL", usuarioId: d.usuarioId, tripulanteId: d.tripulanteId } });
      await mk({ nombre: "Beto", apellido: "Salgado", puesto: "Capitán", esquema: "POR_DIA", sueldo: 900, tripulanteId: trip("Beto") });
      await mk({ nombre: "Lola", apellido: "Mendoza", puesto: "Capitán", esquema: "FIJO_PERIODO", sueldo: 9000, tripulanteId: trip("Lola") });
      await mk({ nombre: "Víctor", apellido: "Ventas", puesto: "Ventas", esquema: "FIJO_PERIODO", sueldo: 7500, usuarioId: uid("ventas@demo.test") });
      await mk({ nombre: "Ana", apellido: "Demo", puesto: "Administración", esquema: "FIJO_PERIODO", sueldo: 18000, periodicidad: "MENSUAL", usuarioId: uid("admin@demo.test") });
      await mk({ nombre: "Rosa", apellido: "Pérez", puesto: "Limpieza", esquema: "POR_DIA", sueldo: 450 });
      empleados = await tx.empleado.findMany({ include: { tripulante: { select: { nombre: true } }, usuario: { select: { email: true } } } });
    }
    if (!ubic) throw new Error("Falta una ubicación de asistencia.");
    const por = (nombre: string) => empleados.find((e) => e.nombre === nombre);

    // Quincena anterior (completa) y actual (los días ya transcurridos), con huecos para ver "sin registro".
    // Si un periodo ya tiene checadas no se vuelve a sembrar.
    const hoy = hoyIso(tenant.zonaHoraria);
    const actual = periodoDe("QUINCENAL", hoy);
    const anterior = periodoDe("QUINCENAL", sumarDias(actual.inicio, -1));
    let pagos = 0;
    for (const periodo of [anterior, actual]) {
      const hasta = periodo.fin < hoy ? periodo.fin : sumarDias(hoy, -1);
      const dias = periodo.inicio <= hasta ? diasEntre(periodo.inicio, hasta) : [];
      if (dias.length > 0 && (await tx.checada.count({ where: { dia: { gte: aDate(periodo.inicio), lte: aDate(periodo.fin) } } })) === 0) {
        const lote: Prisma.ChecadaCreateManyInput[] = [];
        for (const [i, d] of dias.entries()) {
          for (const [nombre, saltar] of [["Beto", 3], ["Lola", 6], ["Víctor", 4], ["Rosa", 5]] as const) {
            const emp = por(nombre); if (!emp || (i + 1) % saltar === 0) continue; // ese día no checó
            for (const [tipo, fecha] of [["ENTRADA", new Date(`${d}T15:05:00Z`)], ["SALIDA", new Date(`${d}T23:10:00Z`)]] as const) // ~8:05 y ~16:10 en Los Cabos
              lote.push({ tenantId: tenant.id, empleadoId: emp.id, tipo, fecha, dia: aDate(d), ubicacionId: ubic.id, lat: 22.8826, lng: -109.9042, distanciaM: 20, precisionM: 12 });
          }
        }
        await tx.checada.createMany({ data: lote }); // una sola consulta en vez de cientos
        const lola = por("Lola");
        if (lola && dias.length >= 4) await tx.diaAsistencia.create({ data: { tenantId: tenant.id, empleadoId: lola.id, fecha: aDate(dias[3]), estado: "FALTA", nota: "Falta injustificada (demo)" } });
        const victor = por("Víctor");
        if (victor && dias.length >= 8) await tx.diaAsistencia.create({ data: { tenantId: tenant.id, empleadoId: victor.id, fecha: aDate(dias[7]), estado: "VACACIONES", nota: "Vacaciones (demo)" } });
      }
      if (dias.length > 0) pagos += (await generarNominaPeriodo(tx, tenant.id, "QUINCENAL", periodo)).generados;
    }
    console.log(`Demo de nómina listo: ${empleados.length} empleados; pagos generados/recalculados: ${pagos}.`);
  }, { timeoutMs: 120_000 });
}

main().finally(() => prisma.$disconnect());
