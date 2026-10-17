-- CreateEnum
CREATE TYPE "RolTripulante" AS ENUM ('CAPITAN', 'MARINERO', 'GUIA', 'COCINERO', 'FOTOGRAFO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoBeneficiario" AS ENUM ('VENDEDOR', 'AGENCIA', 'CONCIERGE', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoTarifaComision" AS ENUM ('FIJO', 'PORCENTAJE', 'PORCENTAJE_BALANCE', 'SIN');

-- CreateEnum
CREATE TYPE "EstadoComision" AS ENUM ('PENDIENTE', 'PAGADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Embarcacion" ADD COLUMN     "extraPaxCasaCentavos" INTEGER,
ADD COLUMN     "paxIncluidosCasa" INTEGER,
ADD COLUMN     "precioCasaCentavos" INTEGER;

-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN     "beneficiarioId" TEXT;

-- CreateTable
CREATE TABLE "Tripulante" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL DEFAULT '',
    "rol" "RolTripulante" NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tripulante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripulanteEmbarcacion" (
    "tenantId" TEXT NOT NULL,
    "tripulanteId" TEXT NOT NULL,
    "embarcacionId" TEXT NOT NULL,

    CONSTRAINT "TripulanteEmbarcacion_pkey" PRIMARY KEY ("tripulanteId","embarcacionId")
);

-- CreateTable
CREATE TABLE "ReservaTripulante" (
    "tenantId" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "tripulanteId" TEXT NOT NULL,
    "rol" "RolTripulante" NOT NULL,
    "horaLlegada" TEXT,

    CONSTRAINT "ReservaTripulante_pkey" PRIMARY KEY ("reservaId","tripulanteId")
);

-- CreateTable
CREATE TABLE "Beneficiario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoBeneficiario" NOT NULL DEFAULT 'VENDEDOR',
    "usuarioId" TEXT,
    "contacto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Beneficiario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarifaComision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "beneficiarioId" TEXT NOT NULL,
    "embarcacionId" TEXT,
    "origen" "OrigenReserva",
    "tipo" "TipoTarifaComision" NOT NULL,
    "valor" INTEGER NOT NULL,
    "umbralPax" INTEGER,
    "valorAlto" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TarifaComision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "beneficiarioId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "baseCentavos" INTEGER NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "pagadoCentavos" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoComision" NOT NULL DEFAULT 'PENDIENTE',
    "regla" TEXT,
    "advertencia" TEXT,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "pagadaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbonoComision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "beneficiarioId" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "metodo" "MetodoPago" NOT NULL DEFAULT 'TRANSFERENCIA',
    "referencia" TEXT,
    "notas" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registradoPorId" TEXT,

    CONSTRAINT "AbonoComision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbonoAplicacion" (
    "tenantId" TEXT NOT NULL,
    "abonoId" TEXT NOT NULL,
    "comisionId" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,

    CONSTRAINT "AbonoAplicacion_pkey" PRIMARY KEY ("abonoId","comisionId")
);

-- CreateTable
CREATE TABLE "CierreComision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "cerrado" BOOLEAN NOT NULL DEFAULT true,
    "cerradoPorId" TEXT,
    "cerradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reabiertoPorId" TEXT,
    "reabiertoEn" TIMESTAMP(3),
    "motivoReapertura" TEXT,

    CONSTRAINT "CierreComision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tripulante_usuarioId_key" ON "Tripulante"("usuarioId");

-- CreateIndex
CREATE INDEX "Tripulante_tenantId_idx" ON "Tripulante"("tenantId");

-- CreateIndex
CREATE INDEX "TripulanteEmbarcacion_tenantId_idx" ON "TripulanteEmbarcacion"("tenantId");

-- CreateIndex
CREATE INDEX "ReservaTripulante_tenantId_idx" ON "ReservaTripulante"("tenantId");

-- CreateIndex
CREATE INDEX "ReservaTripulante_tripulanteId_idx" ON "ReservaTripulante"("tripulanteId");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiario_usuarioId_key" ON "Beneficiario"("usuarioId");

-- CreateIndex
CREATE INDEX "Beneficiario_tenantId_idx" ON "Beneficiario"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiario_tenantId_nombre_key" ON "Beneficiario"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "TarifaComision_tenantId_idx" ON "TarifaComision"("tenantId");

-- CreateIndex
CREATE INDEX "TarifaComision_beneficiarioId_idx" ON "TarifaComision"("beneficiarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Comision_reservaId_key" ON "Comision"("reservaId");

-- CreateIndex
CREATE INDEX "Comision_tenantId_periodo_idx" ON "Comision"("tenantId", "periodo");

-- CreateIndex
CREATE INDEX "Comision_beneficiarioId_estado_idx" ON "Comision"("beneficiarioId", "estado");

-- CreateIndex
CREATE INDEX "AbonoComision_tenantId_idx" ON "AbonoComision"("tenantId");

-- CreateIndex
CREATE INDEX "AbonoComision_beneficiarioId_idx" ON "AbonoComision"("beneficiarioId");

-- CreateIndex
CREATE INDEX "AbonoAplicacion_tenantId_idx" ON "AbonoAplicacion"("tenantId");

-- CreateIndex
CREATE INDEX "AbonoAplicacion_comisionId_idx" ON "AbonoAplicacion"("comisionId");

-- CreateIndex
CREATE UNIQUE INDEX "CierreComision_tenantId_periodo_key" ON "CierreComision"("tenantId", "periodo");

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "Beneficiario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tripulante" ADD CONSTRAINT "Tripulante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tripulante" ADD CONSTRAINT "Tripulante_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripulanteEmbarcacion" ADD CONSTRAINT "TripulanteEmbarcacion_tripulanteId_fkey" FOREIGN KEY ("tripulanteId") REFERENCES "Tripulante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripulanteEmbarcacion" ADD CONSTRAINT "TripulanteEmbarcacion_embarcacionId_fkey" FOREIGN KEY ("embarcacionId") REFERENCES "Embarcacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaTripulante" ADD CONSTRAINT "ReservaTripulante_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaTripulante" ADD CONSTRAINT "ReservaTripulante_tripulanteId_fkey" FOREIGN KEY ("tripulanteId") REFERENCES "Tripulante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiario" ADD CONSTRAINT "Beneficiario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiario" ADD CONSTRAINT "Beneficiario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaComision" ADD CONSTRAINT "TarifaComision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaComision" ADD CONSTRAINT "TarifaComision_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "Beneficiario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaComision" ADD CONSTRAINT "TarifaComision_embarcacionId_fkey" FOREIGN KEY ("embarcacionId") REFERENCES "Embarcacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comision" ADD CONSTRAINT "Comision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comision" ADD CONSTRAINT "Comision_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comision" ADD CONSTRAINT "Comision_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "Beneficiario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoComision" ADD CONSTRAINT "AbonoComision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoComision" ADD CONSTRAINT "AbonoComision_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "Beneficiario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoAplicacion" ADD CONSTRAINT "AbonoAplicacion_abonoId_fkey" FOREIGN KEY ("abonoId") REFERENCES "AbonoComision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoAplicacion" ADD CONSTRAINT "AbonoAplicacion_comisionId_fkey" FOREIGN KEY ("comisionId") REFERENCES "Comision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierreComision" ADD CONSTRAINT "CierreComision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── ROW LEVEL SECURITY de las tablas nuevas ─────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Tripulante','TripulanteEmbarcacion','ReservaTripulante','Beneficiario',
                           'TarifaComision','Comision','AbonoComision','AbonoAplicacion','CierreComision']
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
SET "modulos" = (SELECT ARRAY(SELECT DISTINCT unnest("modulos" || ARRAY['tripulacion','comisiones'])))
WHERE "plan" IN ('PRUEBA', 'PRO');
