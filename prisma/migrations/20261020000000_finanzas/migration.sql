-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('MXN', 'USD');

-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('EFECTIVO', 'BANCO', 'TARJETA_CREDITO', 'PASARELA', 'OTRA');

-- CreateEnum
CREATE TYPE "TipoCategoria" AS ENUM ('GASTO', 'INGRESO');

-- CreateEnum
CREATE TYPE "EstadoMovimiento" AS ENUM ('ACTIVO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigenMovimiento" AS ENUM ('MANUAL', 'PAGO_RESERVA', 'NOMINA', 'COMISION');

-- CreateTable
CREATE TABLE "Cuenta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCuenta" NOT NULL DEFAULT 'BANCO',
    "moneda" "Moneda" NOT NULL DEFAULT 'MXN',
    "saldoInicialCentavos" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoCategoria" NOT NULL,
    "nombre" TEXT NOT NULL,
    "clave" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoriaId" TEXT,
    "cuentaId" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "tipoCambio" DOUBLE PRECISION,
    "montoBaseCentavos" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "embarcacionId" TEXT,
    "reservaId" TEXT,
    "proveedor" TEXT,
    "notas" TEXT,
    "requiereFactura" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoMovimiento" NOT NULL DEFAULT 'ACTIVO',
    "origen" "OrigenMovimiento" NOT NULL DEFAULT 'MANUAL',
    "pagoNominaId" TEXT,
    "abonoComisionId" TEXT,
    "registradoPorId" TEXT,
    "canceladoPorId" TEXT,
    "canceladoEn" TIMESTAMP(3),
    "motivoCancelacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingreso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoriaId" TEXT,
    "cuentaId" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "tipoCambio" DOUBLE PRECISION,
    "montoBaseCentavos" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "reservaId" TEXT,
    "pagoId" TEXT,
    "estado" "EstadoMovimiento" NOT NULL DEFAULT 'ACTIVO',
    "origen" "OrigenMovimiento" NOT NULL DEFAULT 'MANUAL',
    "confirmado" BOOLEAN NOT NULL DEFAULT false,
    "confirmadoPorId" TEXT,
    "confirmadoEn" TIMESTAMP(3),
    "notas" TEXT,
    "registradoPorId" TEXT,
    "canceladoPorId" TEXT,
    "canceladoEn" TIMESTAMP(3),
    "motivoCancelacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ingreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Traspaso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "origenId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "montoOrigenCentavos" INTEGER NOT NULL,
    "montoDestinoCentavos" INTEGER NOT NULL,
    "tipoCambio" DOUBLE PRECISION,
    "fecha" DATE NOT NULL,
    "notas" TEXT,
    "estado" "EstadoMovimiento" NOT NULL DEFAULT 'ACTIVO',
    "registradoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Traspaso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteCuenta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "montoCentavos" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "arqueoId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AjusteCuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArqueoCuenta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teoricoCentavos" INTEGER NOT NULL,
    "contadoCentavos" INTEGER NOT NULL,
    "notas" TEXT,
    "realizadoPorId" TEXT,

    CONSTRAINT "ArqueoCuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gastoId" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "subidoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigFinanzas" (
    "tenantId" TEXT NOT NULL,
    "tipoCambio" DOUBLE PRECISION NOT NULL DEFAULT 17.5,
    "cuentaEfectivoId" TEXT,
    "cuentaTarjetaId" TEXT,
    "cuentaTransferenciaId" TEXT,

    CONSTRAINT "ConfigFinanzas_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "Cuenta_tenantId_idx" ON "Cuenta"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Cuenta_tenantId_nombre_key" ON "Cuenta"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "Categoria_tenantId_idx" ON "Categoria"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_tenantId_tipo_nombre_key" ON "Categoria"("tenantId", "tipo", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_tenantId_clave_key" ON "Categoria"("tenantId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "Gasto_pagoNominaId_key" ON "Gasto"("pagoNominaId");

-- CreateIndex
CREATE UNIQUE INDEX "Gasto_abonoComisionId_key" ON "Gasto"("abonoComisionId");

-- CreateIndex
CREATE INDEX "Gasto_tenantId_fecha_idx" ON "Gasto"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "Gasto_cuentaId_idx" ON "Gasto"("cuentaId");

-- CreateIndex
CREATE INDEX "Gasto_embarcacionId_idx" ON "Gasto"("embarcacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingreso_pagoId_key" ON "Ingreso"("pagoId");

-- CreateIndex
CREATE INDEX "Ingreso_tenantId_fecha_idx" ON "Ingreso"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "Ingreso_cuentaId_idx" ON "Ingreso"("cuentaId");

-- CreateIndex
CREATE INDEX "Traspaso_tenantId_fecha_idx" ON "Traspaso"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "Traspaso_origenId_idx" ON "Traspaso"("origenId");

-- CreateIndex
CREATE INDEX "Traspaso_destinoId_idx" ON "Traspaso"("destinoId");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteCuenta_arqueoId_key" ON "AjusteCuenta"("arqueoId");

-- CreateIndex
CREATE INDEX "AjusteCuenta_tenantId_idx" ON "AjusteCuenta"("tenantId");

-- CreateIndex
CREATE INDEX "AjusteCuenta_cuentaId_idx" ON "AjusteCuenta"("cuentaId");

-- CreateIndex
CREATE INDEX "ArqueoCuenta_tenantId_idx" ON "ArqueoCuenta"("tenantId");

-- CreateIndex
CREATE INDEX "ArqueoCuenta_cuentaId_fecha_idx" ON "ArqueoCuenta"("cuentaId", "fecha");

-- CreateIndex
CREATE INDEX "Comprobante_tenantId_idx" ON "Comprobante"("tenantId");

-- CreateIndex
CREATE INDEX "Comprobante_gastoId_idx" ON "Comprobante"("gastoId");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_ruta_key" ON "Comprobante"("ruta");

-- AddForeignKey
ALTER TABLE "Cuenta" ADD CONSTRAINT "Cuenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categoria" ADD CONSTRAINT "Categoria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_embarcacionId_fkey" FOREIGN KEY ("embarcacionId") REFERENCES "Embarcacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_pagoNominaId_fkey" FOREIGN KEY ("pagoNominaId") REFERENCES "PagoNomina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_abonoComisionId_fkey" FOREIGN KEY ("abonoComisionId") REFERENCES "AbonoComision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traspaso" ADD CONSTRAINT "Traspaso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traspaso" ADD CONSTRAINT "Traspaso_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Traspaso" ADD CONSTRAINT "Traspaso_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteCuenta" ADD CONSTRAINT "AjusteCuenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteCuenta" ADD CONSTRAINT "AjusteCuenta_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteCuenta" ADD CONSTRAINT "AjusteCuenta_arqueoId_fkey" FOREIGN KEY ("arqueoId") REFERENCES "ArqueoCuenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCuenta" ADD CONSTRAINT "ArqueoCuenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCuenta" ADD CONSTRAINT "ArqueoCuenta_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Cuenta','Categoria','Gasto','Ingreso','Traspaso','AjusteCuenta','ArqueoCuenta','Comprobante','ConfigFinanzas']
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
SET "modulos" = (SELECT ARRAY(SELECT DISTINCT unnest("modulos" || ARRAY['gastos','ingresos','cuentas'])))
WHERE "plan" IN ('PRUEBA', 'PRO');
