# REPORTE DE AUDITORÍA DE SEGURIDAD - PymeFlow 2026
**Fecha**: 13 de Abril de 2026  
**Auditor**: GitHub Copilot (Experto en Ciberseguridad y DevOps)  
**Estado**: 🔴 **BLOQUEADO PARA PRODUCCIÓN**

---

## 📋 RESUMEN EJECUTIVO

Se han identificado **3 vulnerabilidades CRÍTICAS** que me PROHIBEN el lanzamiento a producción:

| # | Problema | Severidad | Estado | Acción |
|---|----------|-----------|--------|--------|
| 1 | No hay Row Level Security (RLS) en PostgreSQL | 🔴 CRÍTICA | ❌ NO | Implementar políticas RLS |
| 2 | No hay Backups automáticos configurados | 🔴 CRÍTICA | ❌ NO | Configurar backups diarios |
| 3 | Validación de tenantId solo en aplicación (sin BD) | 🔴 CRÍTICA | ⚠️ PARCIAL | Añadir middleware Prisma |

**Otras vulnerabilidades encontradas**: 5 HIGH + 3 MEDIUM (ver al final)

---

## 1️⃣ VULNERABILIDAD CRÍTICA #1: Sin Row Level Security (RLS) en PostgreSQL

### ❌ Estado Actual
```sql
-- PostgreSQL SIN Row Level Security
CREATE TABLE invoices (
  id character varying NOT NULL PRIMARY KEY,
  tenant_id character varying NOT NULL,
  ...
);
-- ❌ Cualquier usuario con acceso a BD puede SELECT * FROM invoices
-- ❌ Si el ORM falla o hay inyección SQL, se filtra TODO
```

### 🎯 Riesgo
- **Cliente A lee datos de Cliente B** si:
  - Hay un bug en el middleware de tenantId
  - Se ejecuta raw SQL sin filtro
  - Se accede directamente a la BD (desde un admin, script, etc.)
- **Cumplimiento**: Viola RGPD, LSSI-CE, normas de privacidad chilenas

### ✅ CORRECCIÓN REQUERIDA

Implementar RLS en todas las tablas multi-tenant. Script a ejecutar en PostgreSQL:

```sql
-- 1. Habilitar RLS en todas las tablas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_entries ENABLE ROW LEVEL SECURITY;

-- 2. Crear políticas para cada tabla
-- Política: solo los usuarios del tenant ven sus datos
CREATE POLICY tenants_rls ON tenants
  USING (id = current_setting('app.current_tenant_id'));

CREATE POLICY users_rls ON users
  USING (tenant_id = current_setting('app.current_tenant_id'));

CREATE POLICY clients_rls ON clients
  USING (tenant_id = current_setting('app.current_tenant_id'));

CREATE POLICY invoices_rls ON invoices
  USING (tenant_id = current_setting('app.current_tenant_id'));

CREATE POLICY expenses_rls ON expenses
  USING (tenant_id = current_setting('app.current_tenant_id'));

CREATE POLICY invoice_items_rls ON invoice_items
  USING (
    invoice_id IN (
      SELECT id FROM invoices 
      WHERE tenant_id = current_setting('app.current_tenant_id')
    )
  );

CREATE POLICY payments_rls ON payments
  USING (
    invoice_id IN (
      SELECT id FROM invoices 
      WHERE tenant_id = current_setting('app.current_tenant_id')
    )
  );

CREATE POLICY cashflow_entries_rls ON cashflow_entries
  USING (tenant_id = current_setting('app.current_tenant_id'));
```

### Integración en Node.js (Prisma)

Crear archivo `/apps/api/src/middleware/tenant-context.middleware.ts`:

```typescript
import type { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database.js";

/**
 * Middleware que configura el contexto de tenant en PostgreSQL
 * Ejecuta SET app.current_tenant_id = :tenantId antes de cada query
 */
export async function tenantContextMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  if (request.user?.tenantId) {
    // Establecer el tenant_id en el contexto de la sesión PostgreSQL
    await db.$executeRawUnsafe(
      `SET app.current_tenant_id = $1`,
      request.user.tenantId
    );
  }
}
```

Registrar en `server.ts`:

```typescript
app.addHook("preHandler", tenantContextMiddleware);
```

**Esfuerzo**: 2-3 horas  
**Riesgo**: Bajo (RLS es estándar en PostgreSQL)  
**Status**: ⏳ DEBE implementarse ANTES de producción

---

## 2️⃣ VULNERABILIDAD CRÍTICA #2: Sin Backups Automáticos

### ❌ Estado Actual
```yaml
# docker-compose.yml - SIN configuración de backups
services:
  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data
    # ❌ Si la máquina se corrompe, SE PIERDEN TODOS LOS DATOS
```

### 🎯 Riesgo
- **Pérdida total de datos** en caso de:
  - Corrupción del volumen Docker
  - Eliminación accidental de base de datos
  - Ataque de ransomware
  - Fallo del hardware
- **RTO (Recovery Time Objective)**: INFINITO (sin backups = irrecuperable)

### ✅ CORRECCIÓN REQUERIDA

**Opción A: Backups automáticos con pg_dump (desarrollo/staging)**

```bash
#!/bin/bash
# /scripts/backup-db.sh
set -e

DB_NAME="pymeflow_dev"
DB_USER="pymeflow"
DB_HOST="localhost"
BACKUP_DIR="/backups/postgresql"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

# Crear backup
mkdir -p "$BACKUP_DIR"
pg_dump -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" \
  | gzip > "$BACKUP_DIR/backup_$DATE.sql.gz"

# Mantener solo últimos 30 días
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +30 -delete

echo "✅ Backup completado: $BACKUP_DIR/backup_$DATE.sql.gz"
```

Automatizar con cron:

```bash
# En producción, añadir a crontab:
0 2 * * * /app/scripts/backup-db.sh >> /var/log/backups.log 2>&1
# Todos los días a las 2 AM
```

**Opción B: Backups en cloud (recomendado para producción)**

Usar AWS RDS, Supabase o similar (backup automático incluido).

**Opción C: Backups con docker-compose (staging)**

```yaml
services:
  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backup:
    image: postgres:16-alpine
    entrypoint: |
      sh -c 'while true; do
        pg_dump -h postgres -U pymeflow pymeflow_dev | gzip > /backups/backup_$(date +%Y-%m-%d_%H).sql.gz
        sleep 86400
      done'
    volumes:
      - ./backups:/backups
    depends_on:
      - postgres
```

**Esfuerzo**: 1-2 horas  
**Riesgo**: Bajo (estándar en operaciones)  
**Status**: ⏳ DEBE configurarse ANTES de producción

---

## 3️⃣ VULNERABILIDAD CRÍTICA #3: Validación de TenantId solo en Aplicación

### ⚠️ Estado Actual
```typescript
// apps/api/src/modules/invoices/invoices.service.ts
async getById(tenantId: string, id: string) {
  const invoice = await db.invoice.findFirst({
    where: { id, tenantId }  // ✅ Bueno: valida en aplicación
  });
  // ❌ MÁS el BD no tiene RLS como respuesta de seguridad
}
```

### 🎯 Riesgo
- **Si hay un bug en cualquier ruta**, alguien puede leer datos de otro tenant
- **Raw SQL queries** pueden no incluir el filtro de tenantId
- **Ejemplo de ataque**:
  ```typescript
  // Si un dev hace esto (INSEGURO):
  const invoices = await db.$queryRaw`SELECT * FROM invoices WHERE id = ${id}`;
  // Falta el tenantId → ¡Usuario B obtiene factura de Usuario A!
  ```

### ✅ CORRECCIÓN REQUERIDA

Implementar Prisma Middleware que inyecte tenantId automáticamente:

Crear `/apps/api/src/middleware/prisma-tenant.middleware.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

type PrismaClientWithMiddleware = Prisma.PrismaClient & {
  $tenantContext?: {
    tenantId: string;
  };
};

declare global {
  var __prisma: PrismaClientWithMiddleware | undefined;
}

const prisma: PrismaClientWithMiddleware = global.__prisma ?? new PrismaClient();

/**
 * Middleware de Prisma que inyecta tenantId en TODAS las queries
 * Previene acceso cross-tenant incluso si el dev olvida el filtro
 */
prisma.$use(async (params, next) => {
  // Si no hay contexto de tenant, continuar sin cambios
  if (!prisma.$tenantContext?.tenantId) {
    return next(params);
  }

  const tenantId = prisma.$tenantContext.tenantId;

  // Modelos que tienen tenantId obligatorio
  const multiTenantModels = [
    "User",
    "Client",
    "Invoice",
    "Expense",
    "CashflowEntry",
    "Notification",
  ];

  // Si el modelo es multi-tenant
  if (multiTenantModels.includes(params.model)) {
    // Inyectar tenantId en WHERE
    if (params.action === "findFirst" || params.action === "findMany") {
      params.args = params.args || {};
      params.args.where = {
        ...params.args.where,
        tenantId,
      };
    }

    // Inyectar en update
    if (params.action === "update" || params.action === "updateMany") {
      params.args = params.args || {};
      params.args.where = {
        ...params.args.where,
        tenantId,
      };
    }

    // Inyectar en delete
    if (params.action === "delete" || params.action === "deleteMany") {
      params.args = params.args || {};
      params.args.where = {
        ...params.args.where,
        tenantId,
      };
    }
  }

  return next(params);
});

export default prisma;
```

Usar en rutas:

```typescript
import prisma from "../middleware/prisma-tenant.middleware.js";

app.get("/:id", async (request) => {
  // Establecer contexto de tenant
  prisma.$tenantContext = { tenantId: request.user.tenantId };

  // Incluso si el dev olvida tenantId, el middleware lo inyecta
  const invoice = await prisma.invoice.findFirst({
    where: { id: request.params.id }
    // ← No necesita mencionar tenantId, el middleware lo añade
  });

  // Limpiar contexto
  prisma.$tenantContext = undefined;

  return { success: true, data: invoice };
});
```

**Esfuerzo**: 2-3 horas  
**Riesgo**: Bajo (validación defensiva)  
**Status**: ⏳ RECOMENDADO ANTES de producción

---

## 📊 Otras Vulnerabilidades Encontradas

### 🔴 HIGH SEVERITY

| # | Problema | Impacto | Solución |
|---|----------|---------|----------|
| 4 | No hay retry logic en SII integration | Facturas perdidas si SII está down | Implementar BullMQ con exponential backoff |
| 5 | DTE webhook receiver falta | No se procesan DTEs entrantes | Crear endpoint POST /webhook/dte-received |
| 6 | No idempotency keys en SII submission | DTEs duplicados si retry ocurre | Usar UUID para cada intento |
| 7 | Raw SQL queries sin tenant filter | Cross-tenant data leak | Usar solo Prisma models, no $queryRaw |
| 8 | No transaction boundaries en multi-step ops | Data inconsistency | Usar db.$transaction() |

### 🟡 MEDIUM SEVERITY

| # | Problema | Impacto | Esfuerzo |
|---|----------|---------|----------|
| 9 | Job timeout no configurado | Jobs cuelgan indefinidamente | 30 min |
| 10 | No webhook signature verification (SII) | Webhooks pueden falsificados | 1 hora |
| 11 | API Keys en logs | Secretos expuestos | 1 hora |

---

## ✅ VARIABLES DE ENTORNO (BIEN CONFIGURADO)

```
✅ .env excluido de .gitignore
✅ Variables validadas con Zod al startup
✅ Secrets no se loguean en producción
✅ JWT_SECRET tiene 32+ caracteres
✅ ENCRYPTION_KEY para datos sensibles
```

**Status**: ✅ OK - No requiere acción

---

## 🚫 BLOQUEO PARA PRODUCCIÓN

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│ ❌ PROHIBIDO LANZAR A PRODUCCIÓN                           │
│                                                             │
│ Razones:                                                    │
│ 1. SIN Row Level Security (RLS) en PostgreSQL              │
│ 2. SIN Backups automáticos configurados                    │
│ 3. Validación de tenantId solo en aplicación (sin defensa) │
│                                                             │
│ Acciones requeridas:                                        │
│ [ ] Implementar RLS en todas las tablas                    │
│ [ ] Configurar backups automáticos (mínimo diarios)        │
│ [ ] Añadir Prisma middleware de tenant filtering          │
│ [ ] Resolver vulnerabilidades HIGH (al menos 7 de ellas)  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 CHECKLIST DE CORRECCIONES

### Críticas (Bloquean producción)
- [ ] **RLS Policies** — Ejecutar scripts SQL en PostgreSQL
- [ ] **Backups Automáticos** — Configurar pg_dump con cron o usar AWS RDS
- [ ] **Prisma Middleware** — Inyegar tenantId automáticamente

### High (Altamente recomendadas)
- [ ] SII Integration — Retry logic con exponential backoff
- [ ] DTE Webhook — Crear endpoint para DTEs entrantes
- [ ] Idempotency Keys — Usar UUID en cada submission
- [ ] Raw SQL Prevention — Forbid $queryRaw, usar solo models

### Medium (Recomendadas)
- [ ] Job Timeout — Configurar timeout en BullMQ workers
- [ ] Webhook Signatures — Verificar HMAC-SHA256 de SII
- [ ] Sanitize Logs — Remover secretos de logs

---

## 📞 CONTACTO Y SOPORTE

Para preguntas o aclaraciones sobre esta auditoría, contactar con DevSecOps.

**Fecha de Revisión**: 13 de Abril de 2026  
**Status**: 🔴 CRÍTICA - REQUIERE ACCIÓN INMEDIATA
