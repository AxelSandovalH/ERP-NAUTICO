# ERP Náutico

ERP SaaS **modular y vertical** para operadores náuticos (charters y tours). Multi-tenant: varias empresas comparten una instalación y una base de datos, aisladas entre sí.

Base conceptual: [papillon-erp](https://github.com/AxelSandovalH/papillon-erp) (ERP de un solo cliente), reescrito aquí como producto multi-tenant.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Prisma 7 + PostgreSQL · Tailwind 4 · Zod · Vitest

## Arranque (Supabase)

1. En tu proyecto de Supabase → **SQL Editor**, ejecuta `db/supabase-setup.sql` (crea el rol `erp_app`; cambia su contraseña antes).
2. Copia `.env.example` a `.env` y rellena las variables (URL, anon key, service role key, connection strings). El `.env` no se versiona; no pegues estas claves en chats ni issues.
3. Corre:

```bash
npm install
npm run db:migrate   # aplica migraciones y políticas RLS a tu proyecto
npm run db:seed      # empresa demo + usuarios en Supabase Auth
npm run dev          # http://localhost:3000
```

Demo: `admin@demo.test` / `demo-password-123` (admin) · `ventas@demo.test` (vendedor).
En Supabase → Authentication → URL Configuration agrega `http://localhost:3000/auth/callback` (y la de producción) a *Redirect URLs*; si desactivas "Confirm email", el registro entra directo.

```bash
npm test             # unitarias, sin BD
npm run test:db      # integración (RLS, anti-doble-reserva) contra un Postgres LOCAL
```

`test:db` usa siempre el Postgres local del `docker-compose.yml` (`npm run db:local` lo levanta), nunca tu proyecto de Supabase.

## Arquitectura

**Multi-tenant con una BD.** Toda tabla operativa lleva `tenantId` y Postgres aplica **Row Level Security**: cada transacción fija `app.tenant_id` y sin él no se ve ninguna fila. Así un `where` olvidado no filtra datos entre empresas.

- La app se conecta con el rol `erp_app` (sin superusuario, no dueño de tablas) por el pooler de Supabase en modo transacción — `DATABASE_URL`. Un rol con BYPASSRLS (como `postgres`) ignoraría RLS.
- Las migraciones usan `postgres` — `MIGRATE_DATABASE_URL`.
- Las tablas operativas **solo** se tocan con `withTenant(tenantId, tx => …)` (`src/lib/db/tenant.ts`). `Tenant` y `Usuario` (identidad) se consultan al iniciar sesión, antes de saber el tenant: tienen RLS con política abierta solo para `erp_app`.
- Supabase expone `public` por su API de datos a `anon`/`authenticated`; la migración `supabase_hardening` les revoca todo. Este ERP no usa esa API: todo el acceso a datos es servidor → Prisma.
- Para una tabla nueva: agrégala a la lista de `ENABLE ROW LEVEL SECURITY` en una migración nueva.

**Módulos.** `src/modules/registry.ts` declara cada módulo (navegación, dependencias) y `MODULOS_POR_PLAN` qué planes lo incluyen. Cada tenant tiene su lista activa (`Tenant.modulos`), editable en Configuración dentro de lo que permite su plan. Las páginas se protegen con `requireModulo("<id>", permiso?)`.

| Módulo | Estado |
|---|---|
| Núcleo: tenants, usuarios, roles, planes, panel | ✅ |
| Flota: embarcaciones, tarifas, bloqueos | ✅ |
| Reservas y clientes, pagos | ✅ |
| Calendario mensual y diario por embarcación | ✅ |
| Tripulación, nómina, comisiones, finanzas, facturación CFDI, transporte, inventario | pendiente (vienen de Papillon) |

**Para agregar un módulo:** registrarlo en `registry.ts`, crear `src/app/(app)/<ruta>/`, proteger con `requireModulo`, y añadir sus tablas con `tenantId` + RLS.

**Reservas.** Fecha + horas locales (minutos desde medianoche), sin timestamps: un charter es "el 5 de marzo de 10:00 a 14:00" donde está la flota. Disponibilidad validada en la transacción con un advisory lock por (embarcación, fecha), de modo que reservas simultáneas no se traslapan. El "hoy" respeta `Tenant.zonaHoraria`.

**Auth.** Supabase Auth (correo + contraseña) con `@supabase/ssr`: cookies de sesión gestionadas por Supabase y refrescadas en `proxy.ts`. `getSesion()` valida el token con `auth.getUser()` y resuelve `Usuario` por `supabaseId`, exigiendo usuario y tenant activos. La `service_role` key solo se usa en servidor para dar de alta usuarios (registro con rollback, Configuración y seed).

## Pendiente antes de producción

- Recuperación de contraseña (flujo de Supabase) y SMTP propio para los correos de Auth; límites de intentos ya vienen de Supabase, revisa su configuración.
- Cobro de suscripción (Stripe) y cambio de plan; hoy el plan lo fija el registro (`PRUEBA`).
- Subdominio por tenant, almacenamiento de archivos, correos transaccionales.
- Auditoría de cambios y respaldo por tenant.
