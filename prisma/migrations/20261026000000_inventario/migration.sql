-- CreateEnum
CREATE TYPE "TipoUbicacion" AS ENUM ('ALMACEN', 'EMBARCACION');

-- CreateEnum
CREATE TYPE "TipoMovInventario" AS ENUM ('COMPRA', 'CONSUMO', 'MERMA', 'AJUSTE', 'TRASPASO_SALIDA', 'TRASPASO_ENTRADA');

-- AlterEnum
ALTER TYPE "OrigenMovimiento" ADD VALUE 'INVENTARIO';

-- CreateTable
CREATE TABLE "Ubicacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoUbicacion" NOT NULL,
    "embarcacionId" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ubicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Articulo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "categoria" TEXT,
    "minimoMilli" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Articulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "ubicacionId" TEXT NOT NULL,
    "tipo" "TipoMovInventario" NOT NULL,
    "cantidadMilli" INTEGER NOT NULL,
    "costoUnitarioCentavos" INTEGER,
    "fecha" DATE NOT NULL,
    "proveedor" TEXT,
    "notas" TEXT,
    "grupoId" TEXT,
    "gastoId" TEXT,
    "estado" "EstadoMovimiento" NOT NULL DEFAULT 'ACTIVO',
    "registradoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ubicacion_embarcacionId_key" ON "Ubicacion"("embarcacionId");

-- CreateIndex
CREATE INDEX "Ubicacion_tenantId_idx" ON "Ubicacion"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Ubicacion_tenantId_nombre_key" ON "Ubicacion"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "Articulo_tenantId_idx" ON "Articulo"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Articulo_tenantId_nombre_key" ON "Articulo"("tenantId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoInventario_gastoId_key" ON "MovimientoInventario"("gastoId");

-- CreateIndex
CREATE INDEX "MovimientoInventario_tenantId_articuloId_ubicacionId_idx" ON "MovimientoInventario"("tenantId", "articuloId", "ubicacionId");

-- CreateIndex
CREATE INDEX "MovimientoInventario_tenantId_fecha_idx" ON "MovimientoInventario"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoInventario_grupoId_idx" ON "MovimientoInventario"("grupoId");

-- AddForeignKey
ALTER TABLE "Ubicacion" ADD CONSTRAINT "Ubicacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ubicacion" ADD CONSTRAINT "Ubicacion_embarcacionId_fkey" FOREIGN KEY ("embarcacionId") REFERENCES "Embarcacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Articulo" ADD CONSTRAINT "Articulo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Ubicacion','Articulo','MovimientoInventario']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_aislado ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;

-- El inventario viene desde el plan Gestión (y en la prueba): se activa a las empresas existentes
UPDATE "Tenant"
SET "modulos" = (SELECT ARRAY(SELECT DISTINCT unnest("modulos" || ARRAY['inventario'])))
WHERE "plan" IN ('PRUEBA', 'GESTION', 'ENTERPRISE');
