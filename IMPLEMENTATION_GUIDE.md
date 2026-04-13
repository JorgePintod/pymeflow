# GUÍA DE IMPLEMENTACIÓN - Correcciones Críticas de Seguridad

Documento que guía la implementación de las 3 vulnerabilidades críticas identificadas en la auditoría de seguridad del 13 de Abril de 2026.

---

## 📋 CHECKLIST DE IMPLEMENTACIÓN

### PASO 1: Row Level Security (RLS) en PostgreSQL
**Esfuerzo**: 30 minutos  
**Riesgo**: Bajo  
**Estado**: ├─ TODO

```bash
# 1. Conectarse a la BD de desarrollo
psql -h localhost -U pymeflow -d pymeflow_dev

# 2. Ejecutar el script SQL
\i ./scripts/enable-rls.sql

# 3. Verificar que RLS está habilitado:
\d+ invoices
# Debe mostrar: "Row security: ENABLED"

# 4. Probar aislamiento:
SET app.current_tenant_id = 'tenant_a_id';
SELECT * FROM invoices;
SET app.current_tenant_id = 'tenant_b_id';
SELECT * FROM invoices;
SELECT * FROM invoices;  -- SIN SET: devuelve 0 filas ✅
```

**Qué sucede**:
- ✅ PostgreSQL rechaza cualquier query que no incluya el tenantId en el contexto
- ✅ Incluso si el ORM falla, la BD protege los datos
- ✅ Cumple RGPD y normas de privacidad

---

### PASO 2: Configurar Backups Automáticos
**Esfuerzo**: 45 minutos  
**Riesgo**: Bajo  
**Estado**: ├─ TODO

#### Opción A: Backups locales con cron (DESARROLLO/STAGING)

```bash
# 1. Crear directorio de backups
mkdir -p /backups/postgresql

# 2. Crear script de backup
cat > /scripts/backup-db.sh << 'SCRIPT'
#!/bin/bash
set -e

DB_NAME="pymeflow_dev"
DB_USER="pymeflow"
DB_HOST="localhost"
BACKUP_DIR="/backups/postgresql"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

# Crear backup comprimido
mkdir -p "$BACKUP_DIR"
pg_dump -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" \
  | gzip > "$BACKUP_DIR/backup_$DATE.sql.gz"

# Mantener solo últimos 30 días
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +30 -delete

echo "✅ Backup completado: $BACKUP_DIR/backup_$DATE.sql.gz"
SCRIPT

chmod +x /scripts/backup-db.sh

# 3. Agendar cron (diario a las 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /scripts/backup-db.sh >> /var/log/backups.log 2>&1") | crontab -

# 4. Verificar cron
crontab -l | grep backup-db
```

#### Opción B: Backups docker-compose (RECOMENDADO)

Añadir a `docker-compose.yml`:

```yaml
services:
  postgres-backup:
    image: postgres:16-alpine
    container_name: pymeflow_backup
    environment:
      PGPASSWORD: pymeflow_dev_pass
    entrypoint: |
      sh -c '
        while true; do
          BACKUP_FILE="/backups/backup_$(date +%Y-%m-%d_%H-%M-%S).sql.gz"
          pg_dump -h postgres -U pymeflow pymeflow_dev | gzip > "$BACKUP_FILE"
          echo "✅ Backup: $BACKUP_FILE"
          find /backups -name "backup_*.sql.gz" -mtime +30 -delete
          sleep 86400
        done
      '
    volumes:
      - ./backups:/backups
    depends_on:
      - postgres
    restart: unless-stopped
```

Ejecutar:
```bash
docker-compose up -d postgres-backup
```

#### Opción C: Backups en AWS RDS (PRODUCCIÓN RECOMENDADA)

- AWS RDS maneja backups automáticos cada 24 horas
- Restore point in time (PITR): últimos 35 días
- Copias de seguridad multi-AZ automáticas
- Ver: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_BackupRestore.html

**Verificar backups creados**:
```bash
ls -lha ./backups/
# backup_2026-04-13_02-00-00.sql.gz  (33 MB)
# backup_2026-04-12_02-00-00.sql.gz  (32 MB)
```

---

### PASO 3: Middleware de Prisma para Tenant Filtering Defensivo
**Esfuerzo**: 1 hora  
**Riesgo**: Bajo  
**Estado**: ├─ TODO

El archivo ya está creado: `/apps/api/src/middleware/prisma-tenant.middleware.ts`

#### Implementación:

1. **Registrar middleware en todas las rutas** (en `server.ts`):

```typescript
import { db as prismaDb } from "./config/database.js";

app.addHook("preHandler", async (request) => {
  // Establecer contexto de tenant para esta request
  if (request.user?.tenantId) {
    (prismaDb as any).setTenantContext(request.user.tenantId);
  }
});

app.addHook("onResponse", async () => {
  // Limpiar contexto después de la response
  (prismaDb as any).clearTenantContext();
});
```

2. **Usar en servicios** (sin cambios, el middleware funciona transparentemente):

```typescript
// Antes (manual):
await db.invoice.findFirst({
  where: { id, tenantId }  // ← Tenía que incluir tenantId manualmente
});

// Después (automático):
await db.invoice.findFirst({
  where: { id }  // ← El middleware inyecta tenantId automáticamente
});
```

3. **Verificar en tests**:

```typescript
// Test: Verificar que el middleware previene cross-tenant access
const testTenantAId = "tenant_a";
const testTenantBId = "tenant_b";

// Simular contexto del Tenant A
prismaDb.setTenantContext(testTenantAId);
const invoiceA = await db.invoice.create({
  data: { /* ... */, tenantId: testTenantAId }
});

// Cambiar a contexto del Tenant B
prismaDb.setTenantContext(testTenantBId);
const invoices = await db.invoice.findMany({});
assert(invoices.length === 0, "❌ Tenant B ve datos de Tenant A!");

console.log("✅ Middleware de isolación funciona");
```

---

## 🚀 PLAN DE ROLLOUT

### Fase 1: Desarrollo/Staging (Esta Semana)
```
[X] Auditoría completada
[_] RLS habilitado en test DB
[_] Backups automatizados en docker-compose
[_] Middleware de Prisma integrado y testeado
[_] Tests de isolación de tenant pasan
```

### Fase 2: Pre-Producción (Próxima Semana)
```
[_] RLS habilitado en staging DB
[_] Migración de datos existentes (si aplica)
[_] Load testing para verificar RLS performance (~5% overhead esperado)
[_] Failover testing de backups
[_] Todos los tests de seguridad pasan
```

### Fase 3: Producción (Después de Fase 2)
```
[_] RLS habilitado en prod DB (durante maintenance window)
[_] Backups configurados en AWS RDS
[_] Monitoreo de logs activado
[_] Rollback plan documentado
[_] On-call engineer disponible
```

---

## ✅ VALIDACIÓN DE CORRECCIONES

Después de implementar, ejecutar:

```bash
# 1. Unit tests
npm run test:api

# 2. Security tests
npm run test:security

# 3. Tenant isolation test
npm run test:isolation

# 4. Load testing
npm run test:load -- --concurrency 1000 --duration 60s

# 5. Backup restore test
./scripts/test-backup-restore.sh
```

---

## 📊 IMPACTO ESPERADO

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| Cross-tenant data leak risk | ALTO | BAJO | -95% |
| RTO (Recovery Time Objective) | ∞ | <1 hora | ✅ |
| DB Performance overhead | — | ~5% | Acceptable |
| Compliance score | RED | GREEN | ✅ |

---

## 🔗 REFERENCIAS

- PostgreSQL RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Prisma Middleware: https://www.prisma.io/docs/concepts/components/prisma-client/middleware
- AWS RDS Backups: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_BackupRestore.html

---

## 📞 SOPORTE

Preguntas? Contactar con el equipo de DevSecOps.

**Última actualización**: 13 de Abril de 2026  
**Status**: 🚧 EN REVISIÓN - REQUIERE APROBACIÓN CTO
