-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('PRUEBA', 'BASICO', 'PRO');

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'GERENTE', 'VENDEDOR', 'OPERACIONES');

-- CreateEnum
CREATE TYPE "TipoEmbarcacion" AS ENUM ('YATE', 'CATAMARAN', 'VELERO', 'LANCHA', 'MOTO_ACUATICA', 'PANGA');

-- CreateEnum
CREATE TYPE "EstadoEmbarcacion" AS ENUM ('ACTIVA', 'MANTENIMIENTO', 'INACTIVA');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigenReserva" AS ENUM ('DIRECTO', 'WEB', 'AGENCIA', 'CONCIERGE');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'PRUEBA',
    "modulos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'VENDEDOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embarcacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoEmbarcacion" NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "esloraPies" INTEGER,
    "color" TEXT NOT NULL DEFAULT '#0ea5e9',
    "estado" "EstadoEmbarcacion" NOT NULL DEFAULT 'ACTIVA',
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embarcacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tarifa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "embarcacionId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "duracionMin" INTEGER NOT NULL,
    "precioCentavos" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tarifa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueoEmbarcacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "embarcacionId" TEXT NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "BloqueoEmbarcacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "folio" INTEGER NOT NULL,
    "embarcacionId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tarifaId" TEXT,
    "fecha" DATE NOT NULL,
    "inicioMin" INTEGER NOT NULL,
    "finMin" INTEGER NOT NULL,
    "pax" INTEGER NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'PENDIENTE',
    "origen" "OrigenReserva" NOT NULL DEFAULT 'DIRECTO',
    "totalCentavos" INTEGER NOT NULL,
    "notas" TEXT,
    "creadorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "referencia" TEXT,
    "pagadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolioContador" (
    "tenantId" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FolioContador_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_tenantId_idx" ON "Usuario"("tenantId");

-- CreateIndex
CREATE INDEX "Embarcacion_tenantId_idx" ON "Embarcacion"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Embarcacion_tenantId_nombre_key" ON "Embarcacion"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "Tarifa_tenantId_idx" ON "Tarifa"("tenantId");

-- CreateIndex
CREATE INDEX "Tarifa_embarcacionId_idx" ON "Tarifa"("embarcacionId");

-- CreateIndex
CREATE INDEX "BloqueoEmbarcacion_tenantId_idx" ON "BloqueoEmbarcacion"("tenantId");

-- CreateIndex
CREATE INDEX "BloqueoEmbarcacion_embarcacionId_desde_hasta_idx" ON "BloqueoEmbarcacion"("embarcacionId", "desde", "hasta");

-- CreateIndex
CREATE INDEX "Cliente_tenantId_idx" ON "Cliente"("tenantId");

-- CreateIndex
CREATE INDEX "Cliente_tenantId_nombre_idx" ON "Cliente"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "Reserva_tenantId_fecha_idx" ON "Reserva"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "Reserva_embarcacionId_fecha_idx" ON "Reserva"("embarcacionId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Reserva_tenantId_folio_key" ON "Reserva"("tenantId", "folio");

-- CreateIndex
CREATE INDEX "Pago_tenantId_idx" ON "Pago"("tenantId");

-- CreateIndex
CREATE INDEX "Pago_reservaId_idx" ON "Pago"("reservaId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embarcacion" ADD CONSTRAINT "Embarcacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarifa" ADD CONSTRAINT "Tarifa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarifa" ADD CONSTRAINT "Tarifa_embarcacionId_fkey" FOREIGN KEY ("embarcacionId") REFERENCES "Embarcacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueoEmbarcacion" ADD CONSTRAINT "BloqueoEmbarcacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueoEmbarcacion" ADD CONSTRAINT "BloqueoEmbarcacion_embarcacionId_fkey" FOREIGN KEY ("embarcacionId") REFERENCES "Embarcacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_embarcacionId_fkey" FOREIGN KEY ("embarcacionId") REFERENCES "Embarcacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_tarifaId_fkey" FOREIGN KEY ("tarifaId") REFERENCES "Tarifa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_creadorId_fkey" FOREIGN KEY ("creadorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- Cada transacción de la app fija `app.tenant_id` (ver src/lib/db). Sin ese
-- valor, current_setting devuelve NULL y no se ve ni se escribe ninguna fila.
-- Tenant y Usuario quedan fuera: se consultan al iniciar sesión.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Embarcacion','Tarifa','BloqueoEmbarcacion','Cliente','Reserva','Pago','FolioContador']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_aislado ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- Permisos para el rol de la app en las tablas ya creadas
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
