-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('SOLICITADA', 'TIMBRADA', 'ERROR', 'CANCELANDO', 'CANCELADA');

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "codigoPostalFiscal" TEXT,
ADD COLUMN     "correoFactura" TEXT,
ADD COLUMN     "razonSocialFiscal" TEXT,
ADD COLUMN     "regimenFiscal" TEXT,
ADD COLUMN     "rfc" TEXT,
ADD COLUMN     "usoCfdi" TEXT;

-- CreateTable
CREATE TABLE "ConexionProcura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizacionId" TEXT,
    "llaveCifrada" TEXT NOT NULL,
    "claveProdServ" TEXT,
    "claveUnidad" TEXT NOT NULL DEFAULT 'E48',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "verificadaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConexionProcura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaEmitida" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservaId" TEXT,
    "trasladoId" TEXT,
    "clienteId" TEXT NOT NULL,
    "subtotalCentavos" INTEGER NOT NULL,
    "ivaCentavos" INTEGER NOT NULL,
    "totalCentavos" INTEGER NOT NULL,
    "formaPago" TEXT NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "receptor" JSONB NOT NULL,
    "procuraSaleId" TEXT,
    "procuraCfdiId" TEXT,
    "uuid" TEXT,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'SOLICITADA',
    "error" TEXT,
    "solicitadaPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacturaEmitida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConexionProcura_tenantId_key" ON "ConexionProcura"("tenantId");

-- CreateIndex
CREATE INDEX "FacturaEmitida_tenantId_estado_idx" ON "FacturaEmitida"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "FacturaEmitida_reservaId_idx" ON "FacturaEmitida"("reservaId");

-- CreateIndex
CREATE INDEX "FacturaEmitida_trasladoId_idx" ON "FacturaEmitida"("trasladoId");

-- AddForeignKey
ALTER TABLE "ConexionProcura" ADD CONSTRAINT "ConexionProcura_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaEmitida" ADD CONSTRAINT "FacturaEmitida_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaEmitida" ADD CONSTRAINT "FacturaEmitida_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaEmitida" ADD CONSTRAINT "FacturaEmitida_trasladoId_fkey" FOREIGN KEY ("trasladoId") REFERENCES "Traslado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaEmitida" ADD CONSTRAINT "FacturaEmitida_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una factura nace de una reserva O de un traslado, nunca de ambos ni de ninguno
ALTER TABLE "FacturaEmitida" ADD CONSTRAINT "FacturaEmitida_un_origen" CHECK (("reservaId" IS NULL) <> ("trasladoId" IS NULL));

-- Solo una factura viva por origen (una cancelada o con error deja volver a facturar)
CREATE UNIQUE INDEX "FacturaEmitida_reserva_viva" ON "FacturaEmitida"("reservaId") WHERE "reservaId" IS NOT NULL AND "estado" IN ('SOLICITADA', 'TIMBRADA', 'CANCELANDO');
CREATE UNIQUE INDEX "FacturaEmitida_traslado_viva" ON "FacturaEmitida"("trasladoId") WHERE "trasladoId" IS NOT NULL AND "estado" IN ('SOLICITADA', 'TIMBRADA', 'CANCELANDO');

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ConexionProcura','FacturaEmitida']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_aislado ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;

-- Facturación viene desde el plan Gestión (y en la prueba): se activa a las empresas existentes
UPDATE "Tenant"
SET "modulos" = (SELECT ARRAY(SELECT DISTINCT unnest("modulos" || ARRAY['facturacion'])))
WHERE "plan" IN ('PRUEBA', 'GESTION', 'ENTERPRISE');
