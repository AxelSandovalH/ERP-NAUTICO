import "dotenv/config";
import { defineConfig } from "prisma/config";

// Las migraciones corren con el dueño de las tablas (ignora RLS); la app usa
// DATABASE_URL con el rol `erp_app`, sobre el que RLS sí aplica.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["MIGRATE_DATABASE_URL"] ?? process.env["DATABASE_URL"] },
});
