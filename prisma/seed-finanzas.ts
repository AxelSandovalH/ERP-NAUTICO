import "dotenv/config";
import { prisma } from "../src/lib/db/client";
import { withTenant } from "../src/lib/db/tenant";
import { hoyIso, sumarDias } from "../src/lib/fechas";
import {
  asegurarCategoriasBase, crearTraspaso, registrarArqueo, registrarGasto, registrarIngreso, saldosPorCuenta, sincronizarPagosComoIngresos,
} from "../src/lib/finanzas/servicio";

// Datos DEMO de finanzas para la empresa "cabo-demo". Idempotente: si ya hay cuentas, no hace nada.
async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "cabo-demo" } });
  if (!tenant) throw new Error('No existe la empresa "cabo-demo": corre primero `npm run db:seed`.');
  await withTenant(tenant.id, async (tx) => {
    if ((await tx.cuenta.count()) > 0) { console.log("Datos de finanzas ya existen: nada que hacer."); return; }
    await asegurarCategoriasBase(tx, tenant.id);
    const cuenta = (nombre: string, tipo: "EFECTIVO" | "BANCO" | "PASARELA", moneda: "MXN" | "USD", ini: number) =>
      tx.cuenta.create({ data: { tenantId: tenant.id, nombre, tipo, moneda, saldoInicialCentavos: ini * 100 } });
    const caja = await cuenta("Caja oficina", "EFECTIVO", "MXN", 8_000);
    const banorte = await cuenta("Banorte MXN", "BANCO", "MXN", 150_000);
    const bbva = await cuenta("BBVA USD", "BANCO", "USD", 4_000);
    await tx.configFinanzas.upsert({
      where: { tenantId: tenant.id }, update: {},
      create: { tenantId: tenant.id, tipoCambio: 17.5, cuentaEfectivoId: caja.id, cuentaTarjetaId: banorte.id, cuentaTransferenciaId: banorte.id },
    });
    const flota = await tx.embarcacion.findMany({ orderBy: { nombre: "asc" } });
    const cats = await tx.categoria.findMany({ where: { tipo: "GASTO" } });
    const cat = (n: string) => cats.find((c) => c.nombre === n)?.id;
    const hoy = hoyIso(tenant.zonaHoraria);
    const g = (dias: number, concepto: string, monto: number, cuentaId: string, categoria: string, o: { emb?: number; proveedor?: string; tc?: number; factura?: boolean } = {}) =>
      registrarGasto(tx, tenant.id, { concepto, cuentaId, fecha: sumarDias(hoy, -dias), montoCentavos: monto * 100, tipoCambio: o.tc, categoriaId: cat(categoria), embarcacionId: o.emb == null ? null : flota[o.emb]?.id, proveedor: o.proveedor, requiereFactura: o.factura });
    await g(1, "Gasolina Sunseeker 80", 6_200, banorte.id, "Combustible", { emb: 1, proveedor: "Pemex Marina", factura: true });
    await g(2, "Gasolina Catamarán Luna", 4_850, caja.id, "Combustible", { emb: 0, proveedor: "Pemex Marina" });
    await g(3, "Cambio de aceite generador", 3_400, banorte.id, "Mantenimiento y reparaciones", { emb: 1, proveedor: "Náutica del Pacífico", factura: true });
    await g(4, "Víveres y bebidas para tour", 2_150, caja.id, "Insumos", { emb: 0, proveedor: "Costco" });
    await g(6, "Renta de muelle (mes)", 18_000, banorte.id, "Muelle y marina", { proveedor: "Marina Cabo" });
    await g(8, "Seguro de embarcaciones (anual, prorrateo)", 500, bbva.id, "Seguros", { tc: 17.8, proveedor: "Seguros del Mar" });
    await g(9, "Publicidad en redes", 3_000, banorte.id, "Publicidad", { proveedor: "Meta" });
    await registrarIngreso(tx, tenant.id, { concepto: "Venta de souvenirs", cuentaId: caja.id, fecha: sumarDias(hoy, -3), montoCentavos: 1_850 * 100, categoriaId: (await tx.categoria.findFirst({ where: { tipo: "INGRESO", nombre: "Extras y propinas" } }))?.id });
    // Los pagos de reservas ya cobrados pasan a ingresos (a la cuenta por defecto de su método)
    const sync = await sincronizarPagosComoIngresos(tx, tenant.id);
    await crearTraspaso(tx, tenant.id, { origenId: caja.id, destinoId: banorte.id, montoOrigenCentavos: 1_000 * 100, fecha: sumarDias(hoy, -2), notas: "Depósito de efectivo" });
    const teorico = (await saldosPorCuenta(tx)).find((x) => x.cuenta.id === caja.id)!.saldoCentavos;
    await registrarArqueo(tx, tenant.id, { cuentaId: caja.id, contadoCentavos: Math.max(0, teorico - 5_000), notas: "Arqueo de demo: faltan $50" });
    console.log(`Demo de finanzas listo: 3 cuentas, 7 gastos, 1 ingreso manual, ${sync.creados} ingresos de pagos de reservas, 1 traspaso.`);
  }, { timeoutMs: 120_000 });
}

main().finally(() => prisma.$disconnect());
