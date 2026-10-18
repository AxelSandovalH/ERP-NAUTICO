-- CreateEnum
CREATE TYPE "TipoTraslado" AS ENUM ('IDA', 'REGRESO');

-- CreateEnum
CREATE TYPE "EstadoTraslado" AS ENUM ('PROGRAMADO', 'COMPLETADO', 'CANCELADO');

-- AlterEnum
ALTER TYPE "OrigenMovimiento" ADD VALUE 'TRANSPORTE';

-- AlterTable
ALTER TABLE "Gasto" ADD COLUMN     "trasladoId" TEXT;

-- CreateTable
CREATE TABLE "UnidadTransporte" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "placas" TEXT,
    "capacidad" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnidadTransporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Traslado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "tipo" "TipoTraslado" NOT NULL,
    "fecha" DATE NOT NULL,
    "horaMin" INTEGER NOT NULL,
    "duracionMin" INTEGER NOT NULL DEFAULT 60,
    "origen" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "pax" INTEGER NOT NULL,
    "unidadId" TEXT,
    "choferId" TEXT,
    "precioCentavos" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoTraslado" NOT NULL DEFAULT 'PROGRAMADO',
    "notas" TEXT,
    "ingresoId" TEXT,
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Traslado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnidadTransporte_tenantId_idx" ON "UnidadTransporte"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadTransporte_tenantId_nombre_key" ON "UnidadTransporte"("tenantId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Traslado_ingresoId_key" ON "Traslado"("ingresoId");

-- CreateIndex
CREATE INDEX "Traslado_tenantId_fecha_idx" ON "Traslado"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "Traslado_unidadId_fecha_idx" ON "Traslado"("unidadId", "fecha");

-- CreateIndex
CREATE INDEX "Traslado_choferId_fecha_idx" ON "Traslado"("choferId", "fecha");

-- CreateIndex
CREATE INDEX "Traslado_reservaId_idx" ON "Traslado"("reservaId");

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_trasladoId_fkey" FOREIGN KEY ("trasladoId") REFERENCES "Traslado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadTransporte" ADD CONSTRAINT "UnidadTransporte_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "UnidadTransporte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_choferId_fkey" FOREIGN KEY ("choferId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traslado" ADD CONSTRAINT "Traslado_ingresoId_fkey" FOREIGN KEY ("ingresoId") REFERENCES "Ingreso"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['UnidadTransporte','Traslado']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_aislado ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;

-- Transporte viene desde el plan Gestión (y en la prueba): se activa a las empresas existentes
UPDATE "Tenant"
SET "modulos" = (SELECT ARRAY(SELECT DISTINCT unnest("modulos" || ARRAY['transporte'])))
WHERE "plan" IN ('PRUEBA', 'GESTION', 'ENTERPRISE');
