import "dotenv/config";
import { prisma } from "../src/lib/db/client";
import { withTenant } from "../src/lib/db/tenant";
import { cifrar } from "../src/lib/procura/cifrado";
import { crearClienteProcura } from "../src/lib/procura/cliente";

// Conecta una empresa de FleetNautic con SU organización de Procura (solo lo corre el dueño de la plataforma).
//   read -s PROCURA_LLAVE_API; export PROCURA_LLAVE_API
//   npm run procura:conectar -- --empresa <slug> --clave-sat 90121500 [--unidad E48] [--org <id de la organización>] [--sin-probar]
// La llave se lee de la variable de entorno (nunca como argumento, para que no quede en el historial), se prueba contra Procura
// y se guarda CIFRADA (AES-256-GCM con PROCURA_CLAVE_CIFRADO). Repetir el comando reemplaza la llave (rotación).
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const slug = arg("empresa"), claveSat = arg("clave-sat"), unidad = arg("unidad") ?? "E48", org = arg("org");
  const llave = process.env.PROCURA_LLAVE_API, base = process.env.PROCURA_API_URL;
  if (!slug || !claveSat) throw new Error("Uso: npm run procura:conectar -- --empresa <slug> --clave-sat <8 dígitos> [--unidad E48] [--org <id>] [--sin-probar]");
  if (!/^\d{8}$/.test(claveSat)) throw new Error("La clave de producto o servicio del SAT tiene 8 dígitos.");
  if (!llave) throw new Error("Falta PROCURA_LLAVE_API en el entorno (usa: read -s PROCURA_LLAVE_API; export PROCURA_LLAVE_API).");
  if (!base) throw new Error("Falta PROCURA_API_URL en .env (la URL base de Procura).");
  if (!process.env.PROCURA_CLAVE_CIFRADO) throw new Error("Falta PROCURA_CLAVE_CIFRADO en .env (32 bytes en base64: openssl rand -base64 32).");

  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, nombre: true } });
  if (!tenant) throw new Error(`No existe la empresa «${slug}».`);
  if (!process.argv.includes("--sin-probar")) {
    const r = await crearClienteProcura({ baseUrl: base, llave }).probarConexion();
    if (!r.ok) throw new Error(`Procura no aceptó la llave: ${r.mensaje}`);
    console.log("✓ Procura aceptó la llave.");
  }
  const llaveCifrada = cifrar(llave);
  await withTenant(tenant.id, (tx) => tx.conexionProcura.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id, llaveCifrada, claveProdServ: claveSat, claveUnidad: unidad, organizacionId: org ?? null, verificadaEn: new Date() },
    update: { llaveCifrada, claveProdServ: claveSat, claveUnidad: unidad, ...(org ? { organizacionId: org } : {}), activa: true, verificadaEn: new Date() },
  }));
  console.log(`✓ ${tenant.nombre} quedó conectada a Procura (clave SAT ${claveSat}, unidad ${unidad}).`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
