# RESUMEN DE CORRECCIONES DE SEGURIDAD

## Resumen Ejecutivo

La auditoría de seguridad de PymeFlow detectó **8 vulnerabilidades críticas** (5 de ALTA, 3 de MEDIA) relacionadas con aislamiento multi-tenant, resiliencia de jobs y manejo de webhooks. Este documento resume las acciones correctivas y los entregables.

---

## Vulnerabilidades tratadas

### 🔴 GRAVEDAD ALTA (5)

1. **Falta de aislamiento centralizado por tenant**
- **Riesgo**: Los servicios validan `tenantId` de forma manual; es fácil olvidarlo → fuga de datos
- **Causa raíz**: No hay un middleware global de Prisma que aplique el filtro por tenant
- **Solución**: `apps/api/src/middleware/tenant-isolation.middleware.ts`
  - PreHandler de Fastify inyecta `tenantId` en el contexto
  - Middleware de Prisma aplica filtro automático por `tenantId`
  - Uso de `AsyncLocalStorage` para seguimiento entre operaciones asíncronas
- **Severidad**: 🔴 CRÍTICA — podría exponer toda la BD

2. **Sin lógica de reintento para envíos a SII**
- **Riesgo**: Si la API del SII falla temporalmente, la factura no se envía y la operación queda inconclusa
- **Causa raíz**: No existe backoff exponencial ni circuit breaker
- **Solución**: `apps/api/src/jobs/sii-submission.worker.ts`
  - Backoff exponencial: 1s → 512s (10 intentos)
  - Circuit breaker: abre tras 5 fallos consecutivos
  - Dead letter queue: retención de 30 días
- **Severidad**: 🔴 ALTA — flujo crítico del negocio

3. **Falta de endpoint webhook para DTEs entrantes**
- **Riesgo**: Compras de proveedores no registradas → flujo de caja incompleto
- **Causa raíz**: No existe handler de webhook para intermediarios del SII
- **Solución**: `apps/api/src/modules/webhooks/sii-dte.webhook.ts`
  - Endpoint público: `POST /api/v1/webhooks/sii/dte-received`
  - Verificación de firma HMAC-SHA256
  - Tracking por idempotency key (TTL 24h)
  - Crea entradas de flujo de caja y registros de proveedor
- **Severidad**: 🔴 ALTA — brecha funcional crítica

4. **Sin verificación de firma para webhooks**
- **Riesgo**: Webhooks falsos (spoofing) pueden crear registros inválidos
- **Causa raíz**: Ausencia de comprobación de origen del webhook
- **Solución**: implementada en `sii-dte.webhook.ts` (comparación timing-safe HMAC-SHA256)
  - Se utiliza variable de entorno `WEBHOOK_SECRET_SII_DTE`
- **Severidad**: 🔴 ALTA — riesgo de integridad

5. **`$queryRaw` sin protección**
- **Riesgo**: Uso de `$queryRaw` puede exponer datos de todos los tenants
- **Causa raíz**: Middleware Prisma no cubre consultas raw por defecto
- **Solución**: Documentado en `tenant-isolation.middleware.ts` con recomendaciones: restringir `$queryRaw`, exigir comentarios de seguridad y revisiones de código
- **Severidad**: 🔴 ALTA — vector de error humano

---

### 🟡 GRAVEDAD MEDIA (3)

6. **Sin transacciones en operaciones multi-paso**
- **Riesgo**: En emisión de DTEs, si falla un paso intermedio, el estado queda inconsistente
- **Recomendación**: usar `db.$transaction()` para operaciones compuestas
- **Implementación**: fase futura (fuera del alcance inmediato)
- **Severidad**: 🟡 MEDIA

7. **Jobs sin timeout configurado**
- **Riesgo**: Jobs pueden bloquear la cola si una operación externa cuelga
- **Causa raíz**: BullMQ no configurado con timeout para SII
- **Solución**: `apps/api/src/jobs/queue-config.ts` — timeouts configurables (30 min por defecto para SII) y shutdown ordenado
- **Severidad**: 🟡 MEDIA

8. **Sin claves de idempotencia para envíos a SII**
- **Riesgo**: Reintentos generan envíos duplicados al SII (riesgo legal)
- **Causa raíz**: No se registraban envíos ya procesados
- **Solución**: `sii-submission.worker.ts` + `queue-config.ts` — claves idempotentes por factura, TTL 24h en Redis
- **Severidad**: 🟡 MEDIA

---

## Entregables (resumen)

- `apps/api/src/middleware/tenant-isolation.middleware.ts` — middleware Prisma + Fastify para aislamiento por tenant
- `apps/api/src/jobs/sii-submission.worker.ts` — worker con backoff, circuit breaker, DLQ e idempotencia
- `apps/api/src/modules/webhooks/sii-dte.webhook.ts` — handler de webhooks DTE con verificación y creación de flujo de caja
- `apps/api/prisma/seed.ts` — script de seed multi-tenant
- `apps/api/src/jobs/queue-config.ts` — configuración avanzada de BullMQ

---

## Pasos de Integración Rápidos

1. Actualizar `schema.prisma` para añadir `DteReceived` y ejecutar migraciones.
2. Registrar `tenant-isolation.middleware.ts` en `server.ts` (después de `authenticate`, antes de rutas).
3. Registrar rutas de webhooks (`webhooks.routes.ts`).
4. Crear/usar colas con `createQueueWithConfig(...)` y registrar el worker de SII.
5. Añadir `WEBHOOK_SECRET_SII_DTE` en `.env.local`.
6. Ejecutar `npm run seed`.

---

## Pruebas y Checklist

- Verificar aislamiento entre tenants.
- Emitir facturas y confirmar reintentos y DLQ.
- Enviar webhooks firmados y verificar creación de `DteReceived` y entrada de flujo de caja.
- Ejecutar seed y comprobar datos multi-tenant.
- Revisar métricas en Redis (`job:metrics:*`, `dlq:*`).

---

## Variables de Entorno Requeridas

```bash
WEBHOOK_SECRET_SII_DTE=clave-secreta-de-al-menos-32-caracteres
```

---

## Soporte

Para dudas, revisar los archivos con JSDoc:
- `apps/api/src/middleware/tenant-isolation.middleware.ts`
- `apps/api/src/jobs/sii-submission.worker.ts`
- `apps/api/src/modules/webhooks/sii-dte.webhook.ts`
- `apps/api/src/jobs/queue-config.ts`

---

**Última actualización**: 13 de abril de 2026

**Estado**: ✅ Listo para revisión de código
