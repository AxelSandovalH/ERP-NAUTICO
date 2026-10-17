@AGENTS.md

# ERP Náutico — reglas del proyecto

- Next.js 16 con APIs asíncronas (`cookies()`, `params`, `searchParams` son Promises). `cacheComponents` está desactivado a propósito.
- Tablas operativas: SIEMPRE vía `withTenant()`; nunca `prisma.<modelo>` directo salvo `Tenant`/`Usuario`. Tablas nuevas necesitan `tenantId` + política RLS en su migración.
- Escrituras en server actions: `requireModulo(modulo, permiso)` primero, luego validar con zod.
- Dinero en centavos (Int). Fechas de negocio como `YYYY-MM-DD` (`src/lib/fechas.ts`), horas como minutos desde medianoche.
- UI en español. Pruebas: `npm test` (sin BD) y `npm run test:db` (requiere `npm run db:up`).
- Auth y usuarios: Supabase Auth. `createAdminClient()` (service role) solo para administrar usuarios de Auth, jamás para datos de negocio. Nunca imprimir ni pedir claves en el chat.
