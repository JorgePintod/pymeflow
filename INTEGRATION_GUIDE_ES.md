# GUÍA DE INTEGRACIÓN

Guía para integrar los 5 archivos de corrección en PymeFlow. Explica qué hace cada archivo, por qué importa y cómo usarlo.

═════════════════════════════════════════════════════════════════════════
RESUMEN
═════════════════════════════════════════════════════════════════════════

Esta auditoría de seguridad identificó 8 vulnerabilidades críticas en PymeFlow:

🔴 GRAVEDAD ALTA (5):
1. Falta de aislamiento centralizado por tenant → posibles fugas de datos
2. Falta de reintentos para envíos a SII → fallos silenciosos
3. Falta de endpoint webhook para DTE entrantes → flujo de caja incompleto
4. Sin verificación de firma de webhooks → DTEs falsificados podrían ser aceptados
5. Uso de `$queryRaw` sin protección → desarrolladores pueden filtrar todos los datos

🟡 GRAVEDAD MEDIA (3):
6. Sin transacciones en operaciones multi-paso → estado inconsistente si falla a mitad
7. Sin timeout para jobs → tareas pueden colgarse indefinidamente
8. Sin claves de idempotencia → envíos duplicados de DTE al SII

═════════════════════════════════════════════════════════════════════════
SOLUCIÓN: 5 ARCHIVOS CORRECTIVOS
═════════════════════════════════════════════════════════════════════════

1) `apps/api/src/middleware/tenant-isolation.middleware.ts`
- Aborda: vulnerabilidades #1 y #5
- Características: preHandler de Fastify para inyectar `tenantId`, middleware de Prisma que filtra TODAS las consultas por `tenantId`, uso de `AsyncLocalStorage` y logging de auditoría.
- Tamaño aproximado: ~300 líneas
- Tiempo estimado de integración: 15 minutos

2) `apps/api/src/jobs/sii-submission.worker.ts`
- Aborda: vulnerabilidades #2, #7, #8
- Características: backoff exponencial (1s → 512s con ±10% jitter), circuit breaker (se abre tras 5 fallos), dead letter queue (30 días), claves de idempotencia (24h), logging de intentos.
- Tamaño: ~400 líneas
- Tiempo: 20 minutos

3) `apps/api/src/modules/webhooks/sii-dte.webhook.ts`
- Aborda: #3 y #4
- Características: verificación HMAC-SHA256 (timing-safe), resolución de tenant por RUT receptor, creación de entrada de flujo de caja, detección de duplicados por idempotency key, auto-creación de proveedor.
- Tamaño: ~320 líneas
- Tiempo: 30 minutos (+ migración Prisma)

4) `apps/api/prisma/seed.ts` (ACTUALIZADO)
- Generación de datos de prueba multi-tenant: 3 tenants, 10 clientes por tenant, 50 facturas por tenant, 30 gastos por tenant, rangos CAF, suscripciones, entradas de flujo de caja.
- Tamaño: ~280 líneas
- Tiempo: 5 minutos

5) `apps/api/src/jobs/queue-config.ts`
- Aborda: #2, #7, #8
- Características: configuración avanzada para BullMQ (backoff, idempotencia, DLQ, métricas, presets)
- Tamaño: ~320 líneas
- Tiempo: 10 minutos

═════════════════════════════════════════════════════════════════════════
PASOS DE INTEGRACIÓN (RESUMEN)
═════════════════════════════════════════════════════════════════════════

1) Actualizar `schema.prisma` añadiendo el modelo `DteReceived` (ejecutar migración con `npx prisma migrate dev --name add_dte_received` y `npx prisma generate`).

2) Registrar el middleware de aislamiento por tenant en `server.ts` (después de `authenticate`, antes de las rutas).

3) Añadir rutas de webhooks: `apps/api/src/modules/webhooks/webhooks.routes.ts` y registrarlas en `server.ts`.

4) Reemplazar/registrar el worker de SII en `apps/api/src/jobs/index.ts` usando `registerSiiSubmissionWorker` y `enqueueSiiSubmission`.

5) Añadir variable de entorno en `.env.local`:

```bash
WEBHOOK_SECRET_SII_DTE=clave-secreta-de-al-menos-32-caracteres
```

6) Añadir script `seed` en `package.json` y ejecutar `npm run seed` para poblar datos de prueba.

═════════════════════════════════════════════════════════════════════════
CHECKLIST DE PRUEBAS (resumen)
═════════════════════════════════════════════════════════════════════════

- Aislamiento de tenants: verificar que un tenant no vea los datos de otro.
- Worker SII: emitir facturas y confirmar reintentos con backoff; comprobar DLQ en fallos permanentes.
- Webhook DTE: enviar payloads firmados con `X-SII-Signature` y verificar creación de `DteReceived` y entradas de flujo de caja; reintentos ignorados por idempotency key.
- Seed: ejecutar `npm run seed` y comprobar datos multi-tenant.
- Métricas/DLQ: revisar claves en Redis (`job:metrics:*`, `dlq:*`).

═════════════════════════════════════════════════════════════════════════
DESPLIEGUE
═════════════════════════════════════════════════════════════════════════

Fase 1 (Dev): aplicar cambios, migraciones, seed y pruebas (8–10 horas).
Fase 2 (Staging): pruebas de carga y simulación de fallos (16–24 horas).
Fase 3 (Producción): despliegue canario y monitoreo (8–12 horas).

Para más detalles técnicos y comandos, consulte los archivos originales y el `INTEGRATION_GUIDE.md` en inglés si necesita referencias puntuales.
