# Auditoría de Seguridad y Arquitectura — PymeFlow
**Fecha**: abril de 2026 | **Rol**: Arquitecto de Software Senior + Ingeniero QA de Automatización

---

## Resumen ejecutivo

PymeFlow es una plataforma SaaS multi-tenant para contabilidad con flujos complejos:
- Registro y autenticación (Fastify + JWT)
- Ciclo de vida de DTE (documentos electrónicos)
- Integración con SII
- Workflows asíncronos (BullMQ)
- Eventos por webhooks (Stripe)

**Hallazgos críticos**: 5 problemas de ALTA severidad y 3 de MEDIA.

---

## Flujos simulados analizados

1) Registro de tenant: correcto (creación de Tenant, usuario OWNER, emisión de JWT)

2) Emisión de DTE: creado flujo de crear factura → emitir → encolar envío a SII (parcialmente implementado)

3) Webhook de DTE entrante: NO implementado (brecha importante)

4) Job nocturno de cashflow: existe pero sin backoff ni retries robustos

---

## Vulnerabilidades principales

1. **Aislamiento por tenant no centralizado** — alto riesgo de filtrado de datos.
2. **Sin reintentos/exponencial backoff para SII** — jobs fallan sin recuperarse.
3. **Ausencia de receptor de DTE entrantes** — cashflow parcial.
4. **Sin verificación de firmas en webhooks** — posible spoofing.
5. **Uso de `$queryRaw` sin controles** — potencial fuga de datos.
6. **Operaciones multi-paso sin transacción** — riesgo de inconsistencia.
7. **Jobs sin timeout** — pueden colgar la cola.
8. **Sin idempotencia en envíos a SII** — duplicados legales.

---

## Recomendaciones y fixes aplicados

- Implementar middleware global de tenant (Fastify + Prisma middleware con AsyncLocalStorage).
- Crear worker de envío a SII con backoff exponencial, circuit breaker e idempotencia.
- Añadir endpoint webhook para DTEs entrantes con verificación HMAC.
- Añadir configuración centralizada de colas (`queue-config.ts`) y DLQ.
- Crear script de seed para pruebas E2E multi-tenant.

---

## Acciones operativas

- Agregar `WEBHOOK_SECRET_SII_DTE` en `.env` y rotarlo periódicamente.
- Ejecutar migraciones y `npm run seed` en entornos de desarrollo.
- Monitoreo: métricas de jobs, tasas de fallo, DLQ, estado del circuit breaker.

---

## Conclusión

Las correcciones propuestas y archivos generados elevan la plataforma a un nivel de preparación para producción: mitigación de fugas multi-tenant, resiliencia en envíos a SII y soporte para DTEs entrantes. Recomendado: pruebas de carga en staging y despliegue canario.
