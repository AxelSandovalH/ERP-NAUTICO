import type { Prisma } from "@prisma/client";
import { prisma } from "./client";

export type Tx = Prisma.TransactionClient;

/**
 * Ejecuta `fn` en una transacción con `app.tenant_id` fijado, de modo que las
 * políticas RLS de Postgres aíslen los datos del tenant aunque se olvide un
 * `where: { tenantId }`. Es la ÚNICA vía para tocar tablas operativas.
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>, opciones: { timeoutMs?: number } = {}): Promise<T> {
  if (!tenantId) throw new Error("withTenant requiere tenantId");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    },
    // 15 s alcanzan para una pantalla; las operaciones masivas (nómina, recálculo de
    // comisiones) hacen cientos de consultas y piden más plazo.
    { timeout: opciones.timeoutMs ?? 15_000 },
  );
}

/** Siguiente folio de reserva del tenant (atómico, dentro de la transacción). */
export async function siguienteFolio(tx: Tx, tenantId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ ultimo: number }[]>`
    INSERT INTO "FolioContador" ("tenantId", "ultimo") VALUES (${tenantId}, 1)
    ON CONFLICT ("tenantId") DO UPDATE SET "ultimo" = "FolioContador"."ultimo" + 1
    RETURNING "ultimo"`;
  return rows[0].ultimo;
}
