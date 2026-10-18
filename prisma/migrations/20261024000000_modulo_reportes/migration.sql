-- Activa el módulo de reportes a las empresas cuyo plan lo incluye (PRUEBA y ENTERPRISE). Sin cambios de esquema.
UPDATE "Tenant"
SET "modulos" = (SELECT ARRAY(SELECT DISTINCT unnest("modulos" || ARRAY['reportes'])))
WHERE "plan" IN ('PRUEBA', 'ENTERPRISE');
