-- En Supabase todo lo que vive en `public` se expone por la API de datos
-- (PostgREST) a los roles `anon` y `authenticated`. Este ERP accede a la BD solo
-- desde el servidor con el rol `erp_app`, así que se cierra esa puerta:
--   1) se revocan los permisos de anon/authenticated (si existen los roles), y
--   2) Tenant y Usuario también quedan con RLS, accesibles solo para erp_app.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Usuario" FORCE ROW LEVEL SECURITY;

-- La capa de identidad se consulta al iniciar sesión (aún no hay tenant), por
-- eso estas dos políticas son abiertas, pero SOLO para el rol de la app.
CREATE POLICY identidad_app ON "Tenant" FOR ALL TO erp_app USING (true) WITH CHECK (true);
CREATE POLICY identidad_app ON "Usuario" FOR ALL TO erp_app USING (true) WITH CHECK (true);

-- Tablas nuevas: que erp_app las pueda usar sin repetir GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
