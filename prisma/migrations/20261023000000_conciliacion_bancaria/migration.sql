-- CreateEnum
CREATE TYPE "EstadoLinea" AS ENUM ('PENDIENTE', 'CONCILIADA', 'IGNORADA');

-- AlterTable
ALTER TABLE "Cuenta" ADD COLUMN     "mapeoBanco" JSONB;

-- CreateTable
CREATE TABLE "ImportacionBanco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "archivo" TEXT NOT NULL,
    "filas" INTEGER NOT NULL,
    "nuevas" INTEGER NOT NULL,
    "duplicadas" INTEGER NOT NULL,
    "fueraDePeriodo" INTEGER NOT NULL DEFAULT 0,
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportacionBanco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoBanco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "saldoCentavos" INTEGER,
    "referencia" TEXT,
    "huella" TEXT NOT NULL,
    "estado" "EstadoLinea" NOT NULL DEFAULT 'PENDIENTE',
    "gastoId" TEXT,
    "ingresoId" TEXT,
    "traspasoId" TEXT,
    "conciliadoPorId" TEXT,
    "conciliadoEn" TIMESTAMP(3),
    "importacionId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoBanco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CierreConciliacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "saldoBancoCentavos" INTEGER NOT NULL,
    "saldoSistemaCentavos" INTEGER NOT NULL,
    "sinExplicarCentavos" INTEGER NOT NULL,
    "notas" TEXT,
    "cerradoPorId" TEXT,
    "cerradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreConciliacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportacionBanco_tenantId_cuentaId_idx" ON "ImportacionBanco"("tenantId", "cuentaId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoBanco_gastoId_key" ON "MovimientoBanco"("gastoId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoBanco_ingresoId_key" ON "MovimientoBanco"("ingresoId");

-- CreateIndex
CREATE INDEX "MovimientoBanco_tenantId_cuentaId_estado_fecha_idx" ON "MovimientoBanco"("tenantId", "cuentaId", "estado", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoBanco_cuentaId_huella_key" ON "MovimientoBanco"("cuentaId", "huella");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoBanco_traspasoId_cuentaId_key" ON "MovimientoBanco"("traspasoId", "cuentaId");

-- CreateIndex
CREATE INDEX "CierreConciliacion_tenantId_idx" ON "CierreConciliacion"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CierreConciliacion_cuentaId_mes_key" ON "CierreConciliacion"("cuentaId", "mes");

-- AddForeignKey
ALTER TABLE "ImportacionBanco" ADD CONSTRAINT "ImportacionBanco_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionBanco" ADD CONSTRAINT "ImportacionBanco_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoBanco" ADD CONSTRAINT "MovimientoBanco_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoBanco" ADD CONSTRAINT "MovimientoBanco_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoBanco" ADD CONSTRAINT "MovimientoBanco_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoBanco" ADD CONSTRAINT "MovimientoBanco_ingresoId_fkey" FOREIGN KEY ("ingresoId") REFERENCES "Ingreso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoBanco" ADD CONSTRAINT "MovimientoBanco_traspasoId_fkey" FOREIGN KEY ("traspasoId") REFERENCES "Traspaso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoBanco" ADD CONSTRAINT "MovimientoBanco_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionBanco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreConciliacion" ADD CONSTRAINT "CierreConciliacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreConciliacion" ADD CONSTRAINT "CierreConciliacion_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ImportacionBanco','MovimientoBanco','CierreConciliacion']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_aislado ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;

-- Activa el módulo a las empresas cuyo plan lo incluye (PRUEBA y ENTERPRISE)
UPDATE "Tenant"
SET "modulos" = (SELECT ARRAY(SELECT DISTINCT unnest("modulos" || ARRAY['conciliacion'])))
WHERE "plan" IN ('PRUEBA', 'ENTERPRISE');
