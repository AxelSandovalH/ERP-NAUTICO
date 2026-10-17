-- Las credenciales pasan a Supabase Auth: se elimina el hash local y cada
-- usuario referencia su id en auth.users.
-- NOTA: pensada para una BD sin usuarios reales (los datos demo locales se
-- recrean con `npm run db:seed`).
DELETE FROM "Usuario";
ALTER TABLE "Usuario" DROP COLUMN "passwordHash";
ALTER TABLE "Usuario" ADD COLUMN "supabaseId" TEXT NOT NULL;
CREATE UNIQUE INDEX "Usuario_supabaseId_key" ON "Usuario"("supabaseId");
