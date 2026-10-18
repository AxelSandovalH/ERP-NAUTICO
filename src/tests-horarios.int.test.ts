import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "dotenv/config";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/tenant";
import { aDate } from "@/lib/fechas";
import { asignar, copiarSemana, crearPersona, guardarPlantilla, miHorario, publicarSemana, semanaDe, vincularUsuario } from "@/lib/horarios/servicio";

// Requiere Postgres local migrado (npm run test:db lo prepara).
const sfx = Math.random().toString(36).slice(2, 8);
type Ctx = { t: string; ana: string; beto: string; usuarioAna: string; manana: string; noche: string };
const L1 = "2031-03-03", L2 = "2031-03-10"; // dos lunes

async function crearTenant(nombre: string): Promise<Ctx> {
  const t = await prisma.tenant.create({ data: { nombre, slug: `${nombre}-${sfx}` } });
  const u = await prisma.usuario.create({ data: { tenantId: t.id, supabaseId: `sb-${nombre}-${sfx}`, email: `${nombre}-${sfx}@t.test`, nombre: "Ana", rol: "OPERACIONES" } });
  return withTenant(t.id, async (tx) => {
    const ana = await crearPersona(tx, t.id, { nombre: "Ana", apellido: "López", puesto: "Capitán" });
    const beto = await crearPersona(tx, t.id, { nombre: "Beto" });
    const manana = await guardarPlantilla(tx, t.id, null, { nombre: "Mañana", inicioMin: 480, finMin: 960, color: "#0ea5e9" });
    const noche = await guardarPlantilla(tx, t.id, null, { nombre: "Noche", inicioMin: 1320, finMin: 360, color: "#6366f1" });
    return { t: t.id, ana: ana.id, beto: beto.id, usuarioAna: u.id, manana: manana.id, noche: noche.id };
  });
}
const poner = (x: Ctx, empleadoId: string, fecha: string, valor: string) => withTenant(x.t, (tx) => asignar(tx, x.t, { empleadoId, fecha, valor }));
let A: Ctx, B: Ctx;

beforeAll(async () => { A = await crearTenant("ha"); B = await crearTenant("hb"); });
afterAll(async () => { await prisma.tenant.deleteMany({ where: { slug: { endsWith: sfx } } }); await prisma.$disconnect(); });

describe("plantillas", () => {
  it("rechaza nombres repetidos y horarios inválidos", async () => {
    await expect(withTenant(A.t, (tx) => guardarPlantilla(tx, A.t, null, { nombre: "Mañana", inicioMin: 600, finMin: 700, color: "#000000" }))).rejects.toThrow(/mismo nombre|ese nombre/);
    await expect(withTenant(A.t, (tx) => guardarPlantilla(tx, A.t, null, { nombre: "Raro", inicioMin: 600, finMin: 600, color: "#000000" }))).rejects.toThrow(/misma/);
    await expect(withTenant(A.t, (tx) => guardarPlantilla(tx, A.t, null, { nombre: "Rojo", inicioMin: 600, finMin: 700, color: "rojo" }))).rejects.toThrow(/Color/);
  });
  it("el mismo nombre puede existir en otra empresa", async () => {
    expect(await withTenant(B.t, (tx) => tx.plantillaTurno.count({ where: { nombre: "Mañana" } }))).toBe(1);
  });
});

describe("asignar", () => {
  it("un turno por persona y día: reasignar reemplaza, vaciar borra", async () => {
    await poner(A, A.ana, L1, `p:${A.manana}`);
    await poner(A, A.ana, L1, `p:${A.noche}`);
    const t = await withTenant(A.t, (tx) => tx.turnoEmpleado.findMany({ where: { empleadoId: A.ana, fecha: aDate(L1) } }));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ tipo: "TURNO", etiqueta: "Noche", inicioMin: 1320, finMin: 360 });
    await poner(A, A.ana, L1, "VACACIONES");
    expect((await withTenant(A.t, (tx) => tx.turnoEmpleado.findFirst({ where: { empleadoId: A.ana, fecha: aDate(L1) } })))).toMatchObject({ tipo: "VACACIONES", inicioMin: null, plantillaId: null });
    await poner(A, A.ana, L1, "");
    expect(await withTenant(A.t, (tx) => tx.turnoEmpleado.count({ where: { empleadoId: A.ana, fecha: aDate(L1) } }))).toBe(0);
  });
  it("editar la plantilla no mueve lo ya asignado", async () => {
    await poner(A, A.beto, L1, `p:${A.manana}`);
    await withTenant(A.t, (tx) => guardarPlantilla(tx, A.t, A.manana, { nombre: "Mañana", inicioMin: 540, finMin: 1020, color: "#0ea5e9" }));
    expect(await withTenant(A.t, (tx) => tx.turnoEmpleado.findFirst({ where: { empleadoId: A.beto, fecha: aDate(L1) } }))).toMatchObject({ inicioMin: 480, finMin: 960 });
    await withTenant(A.t, (tx) => guardarPlantilla(tx, A.t, A.manana, { nombre: "Mañana", inicioMin: 480, finMin: 960, color: "#0ea5e9" }));
  });
  it("valida fecha, opción, turno inactivo, persona ajena e inactiva", async () => {
    await expect(poner(A, A.ana, "2031-02-31", "DESCANSO")).rejects.toThrow(/Fecha/);
    await expect(poner(A, A.ana, L1, "VUELO")).rejects.toThrow(/Opción/);
    await expect(poner(A, A.ana, L1, "p:inexistente")).rejects.toThrow(/turno/);
    await expect(poner(A, B.ana, L1, "DESCANSO")).rejects.toThrow(/no existe/); // persona de otra empresa (RLS)
    await expect(poner(A, A.ana, L1, `p:${B.manana}`)).rejects.toThrow(/turno/); // plantilla de otra empresa
    const inactivo = await withTenant(A.t, (tx) => crearPersona(tx, A.t, { nombre: "Inactivo" }));
    await withTenant(A.t, (tx) => tx.empleado.update({ where: { id: inactivo.id }, data: { activo: false } }));
    await expect(poner(A, inactivo.id, L1, "DESCANSO")).rejects.toThrow(/inactiva/);
  });
});

describe("copiar semana y publicar", () => {
  it("copia sin pisar lo ya asignado y respeta el día de la semana", async () => {
    await poner(A, A.ana, "2031-03-04", `p:${A.manana}`); // martes de la semana 1
    await poner(A, A.ana, "2031-03-06", "DESCANSO");
    await poner(A, A.beto, "2031-03-04", `p:${A.noche}`);
    await poner(A, A.ana, "2031-03-11", `p:${A.noche}`); // el martes de la semana 2 ya tiene algo
    const r = await withTenant(A.t, (tx) => copiarSemana(tx, A.t, L1, L2));
    expect(r.copiados).toBeGreaterThanOrEqual(2);
    const s2 = await withTenant(A.t, (tx) => semanaDe(tx, A.t, L2));
    const ana = s2.turnos.filter((t) => t.empleadoId === A.ana).map((t) => [t.fecha.toISOString().slice(0, 10), t.tipo, t.etiqueta]);
    expect(ana).toEqual(expect.arrayContaining([["2031-03-11", "TURNO", "Noche"], ["2031-03-13", "DESCANSO", "Descanso"]]));
    expect(s2.turnos.find((t) => t.empleadoId === A.beto && t.fecha.toISOString().startsWith("2031-03-11"))).toMatchObject({ etiqueta: "Noche" });
  });
  it("rechaza fechas que no son lunes o la misma semana", async () => {
    await expect(withTenant(A.t, (tx) => copiarSemana(tx, A.t, "2031-03-04", L2))).rejects.toThrow(/lunes/);
    await expect(withTenant(A.t, (tx) => copiarSemana(tx, A.t, L1, L1))).rejects.toThrow(/distinta/);
  });
  it("el empleado solo ve las semanas publicadas", async () => {
    await withTenant(A.t, (tx) => vincularUsuario(tx, A.t, A.ana, A.usuarioAna));
    const antes = await withTenant(A.t, (tx) => miHorario(tx, A.ana, L1, 2));
    expect(antes.map((s) => s.publicada)).toEqual([false, false]);
    expect(antes[0].dias.every((d) => d.turno === null)).toBe(true);
    await withTenant(A.t, (tx) => publicarSemana(tx, A.t, L1, true));
    const despues = await withTenant(A.t, (tx) => miHorario(tx, A.ana, L1, 2));
    expect(despues.map((s) => s.publicada)).toEqual([true, false]);
    expect(despues[0].dias.find((d) => d.dia === "2031-03-04")?.turno).toMatchObject({ etiqueta: "Mañana" });
    expect(despues[1].dias.every((d) => d.turno === null)).toBe(true);
    await withTenant(A.t, (tx) => publicarSemana(tx, A.t, L1, false));
    expect((await withTenant(A.t, (tx) => miHorario(tx, A.ana, L1, 1)))[0].publicada).toBe(false);
  });
  it("publicar dos veces no duplica y exige lunes", async () => {
    await withTenant(A.t, (tx) => publicarSemana(tx, A.t, L2, true));
    await withTenant(A.t, (tx) => publicarSemana(tx, A.t, L2, true));
    expect(await withTenant(A.t, (tx) => tx.semanaPublicada.count())).toBe(1);
    await expect(withTenant(A.t, (tx) => publicarSemana(tx, A.t, "2031-03-11", true))).rejects.toThrow(/lunes/);
  });
});

describe("personas y usuarios", () => {
  it("un usuario se vincula a una sola persona y debe ser de la misma empresa", async () => {
    await expect(withTenant(A.t, (tx) => vincularUsuario(tx, A.t, A.beto, A.usuarioAna))).rejects.toThrow(/ya está vinculado/);
    await expect(withTenant(A.t, (tx) => vincularUsuario(tx, A.t, A.beto, B.usuarioAna))).rejects.toThrow(/no existe/);
    await withTenant(A.t, (tx) => vincularUsuario(tx, A.t, A.ana, null));
    await withTenant(A.t, (tx) => vincularUsuario(tx, A.t, A.beto, A.usuarioAna));
  });
  it("aislamiento: una empresa no ve los turnos de la otra (RLS)", async () => {
    await poner(B, B.ana, L1, "DESCANSO");
    const mios = await withTenant(A.t, (tx) => semanaDe(tx, A.t, L1));
    expect(mios.turnos.every((t) => t.empleadoId !== B.ana)).toBe(true);
    expect(mios.personas.some((p) => p.id === B.ana)).toBe(false);
  });
});
