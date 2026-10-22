-- CreateEnum
CREATE TYPE "EstadoSalidaActividad" AS ENUM ('PROGRAMADA', 'COMPLETADA', 'CANCELADA');

-- AlterEnum
ALTER TYPE "OrigenMovimiento" ADD VALUE 'ACTIVIDAD';

-- AlterTable
ALTER TABLE "Ingreso" ADD COLUMN     "pagoActividadId" TEXT;

-- CreateTable
CREATE TABLE "Actividad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "duracionMin" INTEGER NOT NULL,
    "precioCentavos" INTEGER NOT NULL,
    "cupo" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0ea5e9',
    "puntoEncuentro" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "fotoRuta" TEXT,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalidaActividad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actividadId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "inicioMin" INTEGER NOT NULL,
    "finMin" INTEGER NOT NULL,
    "cupo" INTEGER NOT NULL,
    "precioCentavos" INTEGER NOT NULL,
    "embarcacionId" TEXT,
    "guiaId" TEXT,
    "estado" "EstadoSalidaActividad" NOT NULL DEFAULT 'PROGRAMADA',
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalidaActividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaActividad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "salidaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pax" INTEGER NOT NULL,
    "precioUnitarioCentavos" INTEGER NOT NULL,
    "totalCentavos" INTEGER NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'CONFIRMADA',
    "origen" "OrigenReserva" NOT NULL DEFAULT 'DIRECTO',
    "notas" TEXT,
    "creadorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservaActividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoActividad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservaActividadId" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "referencia" TEXT,
    "pagadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoActividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Actividad_tenantId_idx" ON "Actividad"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Actividad_tenantId_nombre_key" ON "Actividad"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "SalidaActividad_tenantId_fecha_idx" ON "SalidaActividad"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "SalidaActividad_embarcacionId_fecha_idx" ON "SalidaActividad"("embarcacionId", "fecha");

-- CreateIndex
CREATE INDEX "SalidaActividad_guiaId_fecha_idx" ON "SalidaActividad"("guiaId", "fecha");

-- CreateIndex
CREATE INDEX "SalidaActividad_actividadId_idx" ON "SalidaActividad"("actividadId");

-- CreateIndex
CREATE INDEX "ReservaActividad_tenantId_salidaId_idx" ON "ReservaActividad"("tenantId", "salidaId");

-- CreateIndex
CREATE INDEX "ReservaActividad_clienteId_idx" ON "ReservaActividad"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservaActividad_tenantId_folio_key" ON "ReservaActividad"("tenantId", "folio");

-- CreateIndex
CREATE INDEX "PagoActividad_tenantId_idx" ON "PagoActividad"("tenantId");

-- CreateIndex
CREATE INDEX "PagoActividad_reservaActividadId_idx" ON "PagoActividad"("reservaActividadId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingreso_pagoActividadId_key" ON "Ingreso"("pagoActividadId");

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_pagoActividadId_fkey" FOREIGN KEY ("pagoActividadId") REFERENCES "PagoActividad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalidaActividad" ADD CONSTRAINT "SalidaActividad_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalidaActividad" ADD CONSTRAINT "SalidaActividad_actividadId_fkey" FOREIGN KEY ("actividadId") REFERENCES "Actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalidaActividad" ADD CONSTRAINT "SalidaActividad_embarcacionId_fkey" FOREIGN KEY ("embarcacionId") REFERENCES "Embarcacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalidaActividad" ADD CONSTRAINT "SalidaActividad_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "Tripulante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaActividad" ADD CONSTRAINT "ReservaActividad_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaActividad" ADD CONSTRAINT "ReservaActividad_salidaId_fkey" FOREIGN KEY ("salidaId") REFERENCES "SalidaActividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaActividad" ADD CONSTRAINT "ReservaActividad_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaActividad" ADD CONSTRAINT "ReservaActividad_creadorId_fkey" FOREIGN KEY ("creadorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoActividad" ADD CONSTRAINT "PagoActividad_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoActividad" ADD CONSTRAINT "PagoActividad_reservaActividadId_fkey" FOREIGN KEY ("reservaActividadId") REFERENCES "ReservaActividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Actividad','SalidaActividad','ReservaActividad','PagoActividad']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_aislado ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;

-- Actividades viene desde el plan Gestión (y en la prueba): se activa a las empresas existentes que ya tienen Reservas
UPDATE "Tenant"
SET "modulos" = (SELECT ARRAY(SELECT DISTINCT unnest("modulos" || ARRAY['actividades'])))
WHERE "plan" IN ('PRUEBA', 'GESTION', 'ENTERPRISE') AND 'reservas' = ANY("modulos");
