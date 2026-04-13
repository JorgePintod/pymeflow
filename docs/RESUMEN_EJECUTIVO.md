# PymeFlow — Resumen Ejecutivo

**Versión:** 1.0 · **Fecha:** Abril 2026 · **Audiencia:** Inversores, directores, equipo comercial

---

## ¿Qué es PymeFlow?

**PymeFlow** es una plataforma SaaS de gestión financiera diseñada exclusivamente para **pequeñas y medianas empresas chilenas**. Consolida en una sola pantalla todo lo que una Pyme necesita para operar sin fricción: facturación electrónica con integración al SII, cobranza automática, control de gastos con crédito fiscal, y proyecciones de flujo de caja en tiempo real.

---

## El Problema que Resuelve

Las Pymes chilenas enfrentan tres dolores financieros críticos:

| Dolor | Impacto |
|-------|---------|
| **Facturas sin cobrar** | El 40% de las Pymes tiene impagos superiores a 60 días |
| **Desconocimiento del flujo de caja** | Sin proyección, el 60% no sabe si tendrá liquidez el próximo mes |
| **Complejidad del SII** | Certificados, CAFs y DTEs requieren conocimiento técnico que la mayoría no tiene |

PymeFlow elimina los tres con una interfaz simple, automática e integrada.

---

## Propuesta de Valor

> **"Tu contador digital que trabaja 24/7 — cobra solo, registra todo y siempre sabe cuánto dinero tendrás mañana."**

### Para el Dueño de la Pyme
- **Cero papel**: emite facturas electrónicas válidas ante el SII en segundos
- **Cobranza automática**: el sistema envía recordatorios por email, WhatsApp y SMS sin intervención humana
- **Flujo de caja instantáneo**: proyecciones a 30, 60 y 90 días en un solo click

### Para el Contador
- **Crédito fiscal calculado automáticamente** sobre todos los gastos registrados
- **Historial tributario completo**: XMLs firmados, acuses de recibo SII, PDFs de respaldo
- **Consolidación por períodos**: resúmenes de IVA débito/crédito por mes

---

## Módulos Principales

```
┌─────────────────────────────────────────────────────────┐
│  DASHBOARD                                               │
│  Vista 360° de la salud financiera de la empresa        │
├──────────────┬──────────────┬──────────────┬────────────┤
│  FACTURAS    │  COBRANZA    │  GASTOS      │  FLUJO     │
│  Electrónicas│  Automática  │  + IVA       │  DE CAJA   │
│  con SII     │  Email/WA/SMS│  Crédito     │  30/60/90d │
├──────────────┴──────────────┴──────────────┴────────────┤
│  CLIENTES · SII · NOTIFICACIONES · SUSCRIPCIÓN          │
└─────────────────────────────────────────────────────────┘
```

---

## Modelo de Negocio

PymeFlow opera bajo un modelo **SaaS de suscripción mensual** con tres planes:

| Plan | Target | Incluye |
|------|---------|---------|
| **STARTER** | Microempresas (1-2 personas) | Facturas básicas, cobranza vía email, dashboard |
| **PROFESSIONAL** | Pymes en crecimiento | Todo + WhatsApp/SMS, flujo de caja avanzado, multi-usuario |
| **ENTERPRISE** | Empresas medianas | Todo + múltiples usuarios con roles, soporte prioritario, API |

**Modelo de precios recurrente** administrado vía Stripe. Portal de autogestión de suscripción incluido.

---

## Ventajas Competitivas

1. **Integración SII nativa**: no es un conector externo; PymeFlow construye, firma y envía los DTEs directamente, sin intermediarios costosos
2. **Cobranza omnicanal automática**: la mayoría de competidores solo envía emails; PymeFlow agrega WhatsApp y SMS con logs de entrega
3. **PWA instalable**: funciona como app móvil sin pasar por las tiendas de aplicaciones
4. **Multi-tenancy seguro**: cada empresa completamente aislada; datos cifrados en reposo y tránsito
5. **Arquitectura moderna y escalable**: Fastify + Prisma + Redis + BullMQ; preparado para miles de tenants simultáneos

---

## Métricas Objetivo (Año 1)

| Métrica | Meta |
|---------|------|
| Tenants activos | 500 Pymes |
| MRR objetivo | $ 3.000.000 CLP (~USD 3.200) |
| NPS | ≥ 50 |
| Churn mensual | < 3% |
| Tiempo de onboarding | < 15 minutos |

---

## Estado del Producto

- ✅ Backend completo: 10 módulos, API REST documentada, jobs automáticos
- ✅ Base de datos robusta: 15 modelos con relaciones, migraciones
- ✅ Integración SII: certificados, CAFs, construcción y firma de DTEs
- ✅ Cobranza automática multi-canal operativa
- ✅ Stripe integrado: checkout, portal, webhooks
- ✅ Frontend Next.js: dashboard, facturas, clientes, gastos, cashflow, SII
- ✅ PWA: instalable + notificaciones push
- ✅ Suite de tests unitarios

---

## Equipo y Tecnología

- **Stack**: TypeScript full-stack (Fastify API + Next.js Frontend)
- **Infraestructura**: PostgreSQL + Redis + monorepo Turborepo
- **Seguridad**: JWT con rotación, rate limiting, certificados cifrados, headers Helmet
- **Despliegue**: preparado para Railway / Vercel / Docker

---

*PymeFlow — Simplificando las finanzas de Chile, una Pyme a la vez.*
