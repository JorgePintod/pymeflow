# PymeFlow — Estado Actual vs Planeado

**Fecha**: 13 de Abril 2026 · **Versión**: 1.0

---

## Resumen

Este documento mapea qué funcionalidades del manual de usuario están **implementadas**, **parcialmente implementadas**, o **pendientes**.

---

## Módulo: CLIENTES

| Funcionalidad | Estado | Detalles |
|---|---|---|
| **Agregar cliente** | ✅ Implementado | Modal con campos: razón social, RUT, email, teléfono (scroll en modal), días de pago, dirección, giro/actividad |
| **Búsqueda de clientes** | ✅ Implementado | Barra search con filtro por nombre/RUT en la tabla |
| **Editar cliente** | ✅ Implementado | Botón "Editar" en tabla → abre modal con formulario |
| **Campo teléfono** | ✅ Implementado | Presente en formulario (scroll dentro del modal) |
| **Campo límite de crédito** | ❌ Falta implementar | Schema existe en backend, pero formulario frontend no lo incluye |
| **Desactivar/Reactivar cliente** | ❌ Falta implementar | No existen botones "3 puntos". Badge de estado (Activo/Inactivo) sí aparece |
| **Página de perfil cliente** | ⚠️ Diferente | No hay página `/dashboard/clientes/[id]`. Click "Editar" abre modal. Stats del cliente en tabla principal |
| **Estadísticas de cliente** | ✅ Parcial | Se ven en tabla: Total Facturado, Total Pagado, estado. No hay página de perfil detallado |

---

## Módulo: FACTURAS

| Funcionalidad | Estado | Detalles |
|---|---|---|
| **Crear factura (DRAFT)** | ✅ Implementado | Página `/dashboard/facturas/nueva` con formulario completo |
| **Emitir factura** | ✅ Implementado | Botón "Emitir" en página de detalle cuando status=DRAFT |
| **"Emitir Ahora" durante creación** | ❌ Falta | Creación solo guarda como DRAFT. Debe editarse desde página de detalle para emitir |
| **Registrar pago** | ✅ Implementado | Botón "Registrar pago" abre modal, soporta pagos parciales |
| **Múltiples pagos (cuotas)** | ✅ Implementado | Backend soporta pagos parciales. Frontend muestra historial de pagos |
| **Enviar al SII** | ✅ Implementado | Botón "Enviar al SII" cuando status=ISSUED |
| **Consultar estado SII** | ✅ Implementado | Botón "Consultar SII" para facturas enviadas |
| **Descargar PDF** | ✅ Implementado | Botón "PDF" en página de detalle |
| **Descargar XML** | ✅ Implementado | Botón "XML" visible cuando factura tiene XML (post-SII) |
| **Anular factura** | ✅ Implementado | Botón "Anular" para facturas ISSUED/OVERDUE |
| **Crear nota de crédito/débito** | ✅ Implementado | Type selectable durante creación |
| **Editar borrador** | ⚠️ Parcial | Se puede editar desde detalle, pero UI para edición podría mejorarse |
| **Listar con filtros** | ✅ Implementado | Búsqueda y filtro por estado |

---

## Módulo: COBRANZA

| Funcionalidad | Estado | Detalles |
|---|---|---|
| **Configurar días de recordatorio** | ✅ Implementado | Endpoint en backend, pero UI no está en frontend aún |
| **Configurar canales** | ✅ Implementado | Backend soporta EMAIL/WHATSAPP/SMS. UI no implementada |
| **Ver logs de cobranza** | ❌ Falta | Backend genera logs. Página `/dashboard/cobranza` no implementada en frontend |
| **Ejecutar cobranza manual** | ❌ Falta | Backend tiene endpoint. UI no implementada |
| **Historial de envíos** | ❌ Falta | Logs existen en BD pero no hay UI para visualizar |

---

## Módulo: GASTOS

| Funcionalidad | Estado | Detalles |
|---|---|---|
| **Crear gasto** | ❌ Falta | Backend implementado. Frontend aún no tiene la página |
| **Cálculo de IVA** | ✅ Implementado | Backend calcula automáticamente (neto = total/1.19) |
| **Resumen de IVA por mes** | ❌ Falta | Cálculo en backend. UI no implementada |
| **Categorización de gastos** | ✅ Implementado | Schema incluye categorías. UI falta |
| **Listar gastos** | ❌ Falta | UI no implementada |
| **Marcar como pagado** | ❌ Falta | Backend soporta. UI falta |

---

## Módulo: FLUJO DE CAJA

| Funcionalidad | Estado | Detalles |
|---|---|---|
| **Calcular proyecciones 30/60/90** | ✅ Implementado | Backend tiene engine de cálculo |
| **Visualizar saldo proyectado** | ❌ Falta | UI `/dashboard/flujo-caja` no implementada en frontend |
| **Indicadores de salud (OK/ALERTA/CRÍTICO)** | ✅ Implementado | Backend calcula. UI falta |
| **Agregar entradas manuales** | ❌ Falta | Endpoint existe. UI falta |
| **Sincronizar con transacciones reales** | ❌ Falta | Backend tiene lógica. UI falta |

---

## Módulo: DASHBOARD

| Funcionalidad | Estado | Detalles |
|---|---|---|
| **KPIs principales** | ❌ Falta | Página `/dashboard` no implementada completamente en frontend |
| **Últimas facturas** | ❌ Falta | Widget para dashboard |
| **Top 5 clientes** | ❌ Falta | Widget para dashboard |
| **Status breakdown de facturas** | ❌ Falta | Gráfico para dashboard |
| **Filtros por período** | ❌ Falta | Selector de mes/año |

---

## Módulo: SII (Integración tributaria)

| Funcionalidad | Estado | Detalles |
|---|---|---|
| **Subir certificado digital (.p12)** | ❌ Falta | Backend implementado. Frontend `/dashboard/sii` UI falta |
| **Seleccionar ambiente (Certificación/Producción)** | ❌ Falta | Backend soporta. UI falta |
| **Subir CAF** | ❌ Falta | Backend implementado. UI falta |
| **Gestionar certificados** | ❌ Falta | CRUD en backend. UI falta |
| **Ver estado de certificados** | ❌ Falta | Endpoint existe. UI falta |
| **Construcción de DTE** | ✅ Implementado | Automático al emitir factura |
| **Firma digital de DTE** | ✅ Implementado | Automático, usa certificado almacenado |
| **Envío a SII** | ✅ Implementado | Web Service SOAP funciona |

---

## Módulo: NOTIFICACIONES

| Funcionalidad | Estado | Detalles |
|---|---|---|
| **Web Push Notifications (PWA)** | ❌ Falta | Backend implementado. Frontend UI no implementada |
| **Suscripción push** | ⚠️ Parcial | Endpoint existe. UI para "permitir notificaciones" falta |
| **Desuscripción push** | ❌ Falta | Endpoint existe. UI falta |
| **Centro de notificaciones** | ❌ Falta | Página no implementada |
| **Marcar como leído** | ❌ Falta | Endpoints existen. UI falta |

---

## Módulo: SUSCRIPCIÓN (Stripe)

| Funcionalidad | Estado | Detalles |
|---|---|---|
| **Checkout de Stripe** | ❌ Falta | Backend integrado. Frontend UI falta |
| **Portal de cliente (billing)** | ❌ Falta | Endpoint existe. UI falta |
| **Webhooks de Stripe** | ✅ Implementado | Backend procesa eventos |
| **Cambio de plan** | ❌ Falta | Lógica existe. UI falta |
| **Cancelación de suscripción** | ❌ Falta | Lógica existe. UI falta |

---

## Módulo: USUARIOS Y ROLES

| Funcionalidad | Estado | Detalles |
|---|---|---|
| **Registro de empresa** | ✅ Implementado | POST `/auth/register` funciona. UI simple. |
| **Login** | ✅ Implementado | POST `/auth/login` funciona. |
| **Refresh token** | ✅ Implementado | Rotación de tokens en backend |
| **Logout** | ✅ Implementado | POST `/auth/logout` |
| **Perfil del usuario** | ✅ Implementado | GET `/me` funciona |
| **Multi-usuario por tenant** | ⚠️ Parcial | Backend soporta roles (OWNER/ADMIN/ACCOUNTANT/OPERATOR). UI para invitar/gestionar usuarios falta |
| **Gestión de roles** | ❌ Falta | Backend tiene. UI para asignar roles falta |

---

## Resumen Ejecutivo

### ✅ Totalmente Implementado (Backend + Frontend)
- Autenticación (register/login/refresh/logout)
- CRUD de clientes (sin límite de crédito)
- CRUD de facturas (sin "Emitir Ahora" en creación)
- Registro de pagos (incluyendo parciales)
- Envío a SII
- Descarga de PDF/XML

### ⚠️ Backend OK, Frontend Falta
- Cobranza automática (logs, configuración, ejecución)
- Gastos e IVA
- Flujo de caja
- Dashboard con KPIs
- Modulo SII (cert, CAF, configuración)
- Notificaciones push
- Suscripciones (Stripe)
- Multi-usuario y roles

### ❌ Totalmente Pendiente
- Campo "Límite de crédito" en clientes
- Botones "3 puntos" para desactivar/reactivar
- Página de perfil de cliente
- "Emitir Ahora" durante creación de factura

---

## Próximos Pasos Recomendados

**Prioridad Alta** (crítico para MVP):
1. Implementar UI del Dashboard (`/dashboard/page.tsx`)
2. Implementar módulo Gastos (`/dashboard/gastos/`)
3. Implementar módulo SII (`/dashboard/sii/`)
4. Completar módulo Facturas (agregar UI para editar borradores)

**Prioridad Media** (calidad de vida):
1. Agregar campo "Límite de crédito" en clientes
2. Botones de desactivación de clientes
3. "Emitir Ahora" durante creación de factura
4. Página de perfil del cliente

**Prioridad Baja** (nice-to-have):
1. Notificaciones push completas
2. Historial de cobranza
3. Multi-usuario y gestión de roles

---

*Manual actualizado: 13/04/2026*
