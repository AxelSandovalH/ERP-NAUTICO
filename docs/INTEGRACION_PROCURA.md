# Integración FleetNautic ↔ Procura (facturación)

Facturación de FleetNautic **no timbra por sí misma**: se apoya en Procura (`procuraos.app`, repo `AxelSandovalH/Procura`), que ya emite CFDI 4.0 con Fiscalapi, guarda CFDI emitidos y recibidos, y baja facturas del SAT.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Organizaciones | Se crean y administran desde FleetNautic (llave de plataforma del dueño). El operador no gestiona llaves. |
| Etapa 1 | Emitir CFDI de reservas y traslados cobrados. |
| Etapa 2 | Ligar facturas recibidas (incluidas las del SAT) a gastos que «requieren factura». |
| Etapa 3 | Cambios en Procura: folio propio al crear ventas, webhooks de CFDI y aprovisionamiento por llave de plataforma. |

## Qué existe hoy en Procura (leído del repo, sin modificarlo)

- `POST /api/v1/sales` crea una venta con líneas e IVA por línea; `POST /sales/{id}/payments` registra cobros; `POST /sales/{id}/invoice` timbra y liga el CFDI; `GET /cfdi/{id}` da XML/PDF con URL firmada; `GET /cfdi?direction=received&unlinked=1` lista recibidas.
- Llaves de API de organización (`Authorization: Bearer pk_live_…`, `Idempotency-Key` obligatorio en `POST`). Se crean con **sesión de persona** y solo si el plan de la organización incluye `api` (Empresa).
- Crear una organización (`POST /organizations`) **también exige sesión de persona**: el creador queda como administrador principal. No hay llave de plataforma.
- Los planes se activan por Stripe o a mano («cortesía» con vencimiento). El emisor fiscal se elige entre los dados de alta en Fiscalapi; **el CSD/e.firma se carga en Fiscalapi, nunca en Procura ni en FleetNautic**.
- No hay webhooks de ventas ni de CFDI (solo del flujo de compras) y `POST /sales` no acepta folio propio (solo la importación por CSV).

## Arquitectura

```
FleetNautic (tenant)  ──API key de SU organización──▶  Procura (organización)  ──▶ Fiscalapi ──▶ SAT
       ▲                                                       │
       └──────── webhook cfdi.* (o consulta del estado) ◀───────┘
```

Una organización de Procura por empresa de FleetNautic, con su propia llave. FleetNautic habla con Procura **solo desde el servidor**; las llaves nunca llegan al navegador.

### Datos nuevos en FleetNautic (todo con `tenantId` + RLS)

- `ConexionProcura`: `tenantId` único, `organizacionId`, `llaveCifrada` (AES-256-GCM con `PROCURA_CLAVE_CIFRADO`, solo servidor), `estado`, `emisorFiscalListo`, `creadaEn`.
- `Cliente` + datos fiscales: `rfc`, `razonSocial`, `regimenFiscal`, `codigoPostalFiscal`, `usoCfdi`, `correoFactura`.
- `FacturaEmitida`: origen (reserva o traslado), cliente, `procuraSaleId`, `procuraCfdiId`, `uuid`, estado (`SOLICITADA` · `TIMBRADA` · `ERROR` · `CANCELANDO` · `CANCELADA`), total, mensaje de error seguro.
- `GastoCfdi`: liga un gasto con un CFDI recibido (`procuraCfdiId`, `uuid`, RFC emisor, total).

## Etapa 1: emitir

1. Una reserva o un traslado **cobrado** muestra «Facturar» (permiso `facturacion:emitir`).
2. Se exige el dato fiscal del cliente; si falta, se captura ahí mismo.
3. Se crea la venta en Procura con `Idempotency-Key` = `fn:{tenantId}:{origen}:{id}` y con los cobros espejados (`external_reference` = id del pago): reintentar nunca duplica.
4. Se llama a `POST /sales/{id}/invoice` con receptor, forma de pago (efectivo 01, transferencia 03, tarjeta 04) y método (PUE si está pagada).
5. Se guarda estado, UUID y se ofrece XML y PDF (URLs firmadas pedidas al momento, no almacenadas).
6. Cancelar usa `POST /cfdi/{id}/cancel` con motivo (queda `CANCELANDO` hasta que el SAT confirme).
7. Un solo timbrado por origen; un error del proveedor se muestra con mensaje genérico y el detalle queda en el registro de la solicitud.

## Etapa 2: recibidas

- Botón y cron para sincronizar `GET /cfdi?direction=received&unlinked=1`.
- Sugerencia de pareja con cada gasto marcado «requiere factura»: mismo total (tolerancia de $1), fecha cercana y parecido del proveedor; la persona confirma.
- Un CFDI se liga a un gasto una sola vez y un gasto muestra su factura.

## Etapa 3: cambios en Procura (repo aparte, con pruebas)

1. `POST /sales` acepta `external_ref` y `folio` propios, con upsert idempotente por `external_ref`.
2. Eventos de webhook `cfdi.issued`, `cfdi.cancellation_requested`, `cfdi.cancelled`, `cfdi.cancellation_rejected`, firmados como el resto.
3. **Llave de plataforma** (la pieza delicada): tabla de llaves de partner con alcance `organizations.provision`; `POST /partner/organizations` crea la organización (con usuario de servicio como administrador principal), asigna cortesía de plan con vencimiento, devuelve **una sola vez** la llave de la organización y permite fijar el emisor fiscal. Nunca lee datos de organizaciones que no creó. Auditada, con límite de peticiones y rotación.

## Seguridad

- Llaves cifradas en reposo y nunca en respuestas, logs ni cliente. Rotación desde FleetNautic.
- Cada tenant solo puede usar su propia conexión (RLS); una falla de Procura nunca afecta lo demás de FleetNautic.
- Webhooks con firma verificada y reintentos idempotentes.
- e.firma/CSD: jamás pasan por FleetNautic.

## Decisiones

1. **IVA**: el precio de FleetNautic **no incluye IVA**; se suma 16 % al facturar (venta de una línea con el subtotal y `tax_rate: 0.16`). Decidido.
2. **Costos**: Procura cobra sus planes y timbres con 16 % de IVA y 4 % de cargo de servicio en Stripe. Quién absorbe ese costo por empresa sigue abierto.
3. **Alta fiscal**: cada empresa debe dar de alta su emisor y su CSD en Fiscalapi antes de poder timbrar. Quién guía ese trámite sigue abierto.
4. **Ambiente**: se construye y prueba contra el ambiente de **pruebas** de Fiscalapi; producción solo con aprobación.

## Estado de la Etapa 1 (FleetNautic)

Hecho, probado contra una Procura simulada (no contra la real):
- Modelos `ConexionProcura` (llave cifrada), datos fiscales en `Cliente` y `FacturaEmitida` (una sola factura viva por reserva o traslado, restricción en la base de datos).
- Cliente HTTP de Procura con errores traducidos a mensajes seguros; cifrado AES-256-GCM de llaves.
- Flujo de emisión idempotente: el intento se reserva antes de llamar a Procura; la venta se identifica por referencia `fn:<id>`; un CFDI ya timbrado cuya respuesta se perdió se recupera sin timbrar de nuevo.
- Pantallas: Facturación (por facturar y emitidas), Facturar, detalle (descargas, consultar estado, reintentar, cancelar) y tarjeta «Factura» en reservas y traslados.
- `npm run procura:conectar` conecta una empresa (la llave se lee del entorno, nunca como argumento).

Etapa 2 (recibidas), hecho y probado contra una Procura simulada:
- `GastoCfdi` liga una factura recibida con un gasto (una factura respalda un solo gasto; un gasto, una sola factura).
- `Facturación → Recibidas`: lista los gastos «requiere factura» sin factura y propone la pareja (mismo importe ±$1, misma moneda, de 7 días antes a 60 después, proveedor parecido). La persona confirma.
- Los datos de la factura se piden de nuevo a Procura al ligar (el navegador solo dice cuál); en una transacción con un punto de guardado por gasto.
- El detalle del gasto muestra la factura ligada y permite quitar el vínculo.
- Procura se consulta por `GET /cfdi?direction=RECEIVED` con cursor y fechas; los CFDI que no son de ingreso o están cancelados no se ofrecen.

Pendiente de Procura (prompt de la Etapa 1): `external_ref` y `folio` en `POST /sales`, emisión repetida sin error ambiguo, respuesta de emisión estable, webhooks `cfdi.*`, rol de integración y errores documentados. Mientras tanto FleetNautic usa los endpoints actuales; la búsqueda por referencia solo se acepta si Procura devuelve exactamente esa referencia.
