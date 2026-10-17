-- Planes de pago: Control, Gestión y Enterprise (más la Prueba). Se convierten los planes viejos:
--   BASICO → CONTROL · PRO → ENTERPRISE · PRUEBA se conserva.
-- Postgres no permite quitar valores de un enum, así que se crea uno nuevo y se convierte la columna.
CREATE TYPE "Plan_new" AS ENUM ('PRUEBA', 'CONTROL', 'GESTION', 'ENTERPRISE');

ALTER TABLE "Tenant" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "Tenant" ALTER COLUMN "plan" TYPE "Plan_new" USING (
  CASE "plan"::text WHEN 'BASICO' THEN 'CONTROL' WHEN 'PRO' THEN 'ENTERPRISE' ELSE "plan"::text END
)::"Plan_new";
ALTER TABLE "Tenant" ALTER COLUMN "plan" SET DEFAULT 'PRUEBA';

DROP TYPE "Plan";
ALTER TYPE "Plan_new" RENAME TO "Plan";
