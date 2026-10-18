-- CreateEnum
CREATE TYPE "TipoTurno" AS ENUM ('TURNO', 'DESCANSO', 'VACACIONES', 'INCAPACIDAD', 'PERMISO');

-- CreateTable
CREATE TABLE "PlantillaTurno" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "inicioMin" INTEGER NOT NULL,
    "finMin" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0ea5e9',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlantillaTurno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnoEmpleado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "empleadoId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "TipoTurno" NOT NULL,
    "plantillaId" TEXT,
    "etiqueta" TEXT,
    "inicioMin" INTEGER,
    "finMin" INTEGER,
    "color" TEXT,
    "asignadoPorId" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TurnoEmpleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemanaPublicada" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "semana" DATE NOT NULL,
    "publicadaPorId" TEXT,
    "publicadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemanaPublicada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlantillaTurno_tenantId_idx" ON "PlantillaTurno"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlantillaTurno_tenantId_nombre_key" ON "PlantillaTurno"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "TurnoEmpleado_tenantId_fecha_idx" ON "TurnoEmpleado"("tenantId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "TurnoEmpleado_empleadoId_fecha_key" ON "TurnoEmpleado"("empleadoId", "fecha");

-- CreateIndex
CREATE INDEX "SemanaPublicada_tenantId_idx" ON "SemanaPublicada"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SemanaPublicada_tenantId_semana_key" ON "SemanaPublicada"("tenantId", "semana");

-- AddForeignKey
ALTER TABLE "PlantillaTurno" ADD CONSTRAINT "PlantillaTurno_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoEmpleado" ADD CONSTRAINT "TurnoEmpleado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoEmpleado" ADD CONSTRAINT "TurnoEmpleado_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoEmpleado" ADD CONSTRAINT "TurnoEmpleado_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "PlantillaTurno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemanaPublicada" ADD CONSTRAINT "SemanaPublicada_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['PlantillaTurno','TurnoEmpleado','SemanaPublicada']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_aislado ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;

-- Todos los planes incluyen Horarios: se activa a las empresas existentes
UPDATE "Tenant"
SET "modulos" = (SELECT ARRAY(SELECT DISTINCT unnest("modulos" || ARRAY['horarios'])))
WHERE "plan" IN ('PRUEBA', 'CONTROL', 'GESTION', 'ENTERPRISE');
