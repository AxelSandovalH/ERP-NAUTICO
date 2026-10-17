import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: parseInt(process.env.DATABASE_POOL_MAX ?? "5", 10),
  });
  return new PrismaClient({ adapter, log: ["error"] });
}

/** Cliente crudo: úsalo SOLO para identidad (Tenant/Usuario). El resto de las
 *  tablas tienen RLS y solo devuelven filas dentro de `withTenant`. */
export const prisma = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
