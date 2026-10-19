-- CreateTable
CREATE TABLE "GastoCfdi" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gastoId" TEXT NOT NULL,
    "procuraCfdiId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "rfcEmisor" TEXT NOT NULL,
    "nombreEmisor" TEXT,
    "totalCentavos" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL,
    "emitidoEn" DATE NOT NULL,
    "ligadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GastoCfdi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GastoCfdi_gastoId_key" ON "GastoCfdi"("gastoId");

-- CreateIndex
CREATE INDEX "GastoCfdi_tenantId_idx" ON "GastoCfdi"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GastoCfdi_tenantId_uuid_key" ON "GastoCfdi"("tenantId", "uuid");

-- AddForeignKey
ALTER TABLE "GastoCfdi" ADD CONSTRAINT "GastoCfdi_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoCfdi" ADD CONSTRAINT "GastoCfdi_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
ALTER TABLE "GastoCfdi" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GastoCfdi" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_aislado ON "GastoCfdi"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
