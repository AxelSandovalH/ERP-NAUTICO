-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "pruebaTerminaEn" TIMESTAMP(3);


-- Las empresas que ya estaban en el plan Prueba reciben 7 días a partir de hoy (no se les corta el acceso de golpe)
UPDATE "Tenant" SET "pruebaTerminaEn" = now() + interval '7 days' WHERE "plan" = 'PRUEBA' AND "pruebaTerminaEn" IS NULL;
