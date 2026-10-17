-- CreateEnum
CREATE TYPE "EstadoSuscripcion" AS ENUM ('NINGUNA', 'ACTIVA', 'PAGO_PENDIENTE', 'CANCELADA');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "cancelaAlFinal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "estadoSuscripcion" "EstadoSuscripcion" NOT NULL DEFAULT 'NINGUNA',
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "suscripcionVenceEn" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeCustomerId_key" ON "Tenant"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_stripeSubscriptionId_key" ON "Tenant"("stripeSubscriptionId");
