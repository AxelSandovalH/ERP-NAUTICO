-- CreateEnum
CREATE TYPE "EsquemaPago" AS ENUM ('FIJO_PERIODO', 'POR_DIA');

-- CreateEnum
CREATE TYPE "PeriodicidadPago" AS ENUM ('SEMANAL', 'QUINCENAL', 'MENSUAL');

-- CreateEnum
CREATE TYPE "TipoChecada" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateEnum
CREATE TYPE "EstadoDia" AS ENUM ('TRABAJO', 'DESCANSO', 'VACACIONES', 'INCAPACIDAD', 'PERMISO', 'FALTA');

-- CreateEnum
CREATE TYPE "EstadoPagoNomina" AS ENUM ('PENDIENTE', 'PAGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoConcepto" AS ENUM ('BONO', 'DEDUCCION');

-- CreateTable
CREATE TABLE "Empleado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL DEFAULT '',
    "puesto" TEXT,
    "usuarioId" TEXT,
    "tripulanteId" TEXT,
    "esquema" "EsquemaPago" NOT NULL DEFAULT 'FIJO_PERIODO',
    "sueldoCentavos" INTEGER NOT NULL,
    "periodicidad" "PeriodicidadPago" NOT NULL DEFAULT 'QUINCENAL',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UbicacionAsistencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radioMetros" INTEGER NOT NULL DEFAULT 150,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UbicacionAsistencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checada" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "tipo" "TipoChecada" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dia" DATE NOT NULL,
    "ubicacionId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "distanciaM" INTEGER,
    "precisionM" INTEGER,

    CONSTRAINT "Checada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaAsistencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "EstadoDia" NOT NULL,
    "nota" TEXT,
    "resueltoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiaAsistencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoNomina" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "periodoInicio" DATE NOT NULL,
    "periodoFin" DATE NOT NULL,
    "esquema" "EsquemaPago" NOT NULL,
    "sueldoCentavos" INTEGER NOT NULL,
    "diasPeriodo" INTEGER NOT NULL,
    "diasTrabajados" INTEGER NOT NULL,
    "diasFalta" INTEGER NOT NULL,
    "diasSinRegistro" INTEGER NOT NULL,
    "brutoCentavos" INTEGER NOT NULL,
    "bonosCentavos" INTEGER NOT NULL DEFAULT 0,
    "deduccionesCentavos" INTEGER NOT NULL DEFAULT 0,
    "netoCentavos" INTEGER NOT NULL,
    "estado" "EstadoPagoNomina" NOT NULL DEFAULT 'PENDIENTE',
    "metodo" "MetodoPago",
    "referencia" TEXT,
    "pagadoEn" TIMESTAMP(3),
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PagoNomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptoNomina" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "tipo" "TipoConcepto" NOT NULL,
    "concepto" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "automatico" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,

    CONSTRAINT "ConceptoNomina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_usuarioId_key" ON "Empleado"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_tripulanteId_key" ON "Empleado"("tripulanteId");

-- CreateIndex
CREATE INDEX "Empleado_tenantId_idx" ON "Empleado"("tenantId");

-- CreateIndex
CREATE INDEX "UbicacionAsistencia_tenantId_idx" ON "UbicacionAsistencia"("tenantId");

-- CreateIndex
CREATE INDEX "Checada_tenantId_dia_idx" ON "Checada"("tenantId", "dia");

-- CreateIndex
CREATE INDEX "Checada_empleadoId_dia_idx" ON "Checada"("empleadoId", "dia");

-- CreateIndex
CREATE INDEX "DiaAsistencia_tenantId_fecha_idx" ON "DiaAsistencia"("tenantId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "DiaAsistencia_empleadoId_fecha_key" ON "DiaAsistencia"("empleadoId", "fecha");

-- CreateIndex
CREATE INDEX "PagoNomina_tenantId_periodoInicio_idx" ON "PagoNomina"("tenantId", "periodoInicio");

-- CreateIndex
CREATE UNIQUE INDEX "PagoNomina_empleadoId_periodoInicio_periodoFin_key" ON "PagoNomina"("empleadoId", "periodoInicio", "periodoFin");

-- CreateIndex
CREATE INDEX "ConceptoNomina_pagoId_idx" ON "ConceptoNomina"("pagoId");

-- CreateIndex
CREATE INDEX "ConceptoNomina_tenantId_idx" ON "ConceptoNomina"("tenantId");

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_tripulanteId_fkey" FOREIGN KEY ("tripulanteId") REFERENCES "Tripulante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UbicacionAsistencia" ADD CONSTRAINT "UbicacionAsistencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checada" ADD CONSTRAINT "Checada_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checada" ADD CONSTRAINT "Checada_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checada" ADD CONSTRAINT "Checada_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "UbicacionAsistencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaAsistencia" ADD CONSTRAINT "DiaAsistencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaAsistencia" ADD CONSTRAINT "DiaAsistencia_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNomina" ADD CONSTRAINT "PagoNomina_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoNomina" ADD CONSTRAINT "PagoNomina_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoNomina" ADD CONSTRAINT "ConceptoNomina_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoNomina" ADD CONSTRAINT "ConceptoNomina_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "PagoNomina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Empleado','UbicacionAsistencia','Checada','DiaAsistencia','PagoNomina','ConceptoNomina']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_aislado ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;

-- Activa los módulos nuevos a las empresas cuyo plan los incluye (PRUEBA y PRO)
UPDATE "Tenant"
SET "modulos" = (SELECT ARRAY(SELECT DISTINCT unnest("modulos" || ARRAY['nomina','asistencia'])))
WHERE "plan" IN ('PRUEBA', 'PRO');
