-- ============================================================================
-- SCRIPT DE ROW LEVEL SECURITY (RLS) PARA PYMEFLOW
-- ============================================================================
-- Protege las tablas contra acceso directo desde herramientas externas.
-- Las columnas en Prisma están almacenadas en camelCase ("tenantId", "userId").
--
-- NOTA: El usuario 'pymeflow' es dueño de las tablas y las bypasea por defecto.
-- Este script protege contra roles externos sin privilegios BYPASSRLS.
-- Para producción con un rol de app dedicado (pymeflow_app), aplicar también:
--   ALTER TABLE xxx FORCE ROW LEVEL SECURITY;
--
-- Ejecución:
--   psql -h localhost -U pymeflow -d pymeflow -f scripts/enable-rls.sql
-- ============================================================================

-- 1. HABILITAR RLS EN TODAS LAS TABLAS MULTI-TENANT
-- ============================================================================

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE caf_ranges          ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;

-- TENANTS: se omite ENABLE RLS para no bloquear el flujo de registro.

-- 2. CREAR POLÍTICAS RLS (columnas en camelCase como genera Prisma)
-- ============================================================================
-- Usamos current_setting('app.current_tenant_id', true) con missing_ok=true:
--   - Si no está seteada → retorna NULL → "tenantId" = NULL es FALSE → 0 filas
--   - El servidor la setea en cada request autenticado vía set_config()
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- USERS
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY users_isolate ON users
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY users_insert ON users
  FOR INSERT
  WITH CHECK (true);  -- Registro inicial sin contexto seteado

-- ──────────────────────────────────────────────────────────────────────────
-- CLIENTS
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY clients_isolate ON clients
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ──────────────────────────────────────────────────────────────────────────
-- INVOICES
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY invoices_isolate ON invoices
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ──────────────────────────────────────────────────────────────────────────
-- INVOICE_ITEMS: no tiene tenantId directo → via invoices
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY invoice_items_isolate ON invoice_items
  FOR ALL
  USING (
    "invoiceId" IN (
      SELECT id FROM invoices
      WHERE "tenantId" = current_setting('app.current_tenant_id', true)
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- PAYMENTS: tiene tenantId directo
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY payments_isolate ON payments
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ──────────────────────────────────────────────────────────────────────────
-- EXPENSES
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY expenses_isolate ON expenses
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ──────────────────────────────────────────────────────────────────────────
-- CASHFLOW_ENTRIES
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY cashflow_entries_isolate ON cashflow_entries
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ──────────────────────────────────────────────────────────────────────────
-- NOTIFICATION_LOGS
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY notification_logs_isolate ON notification_logs
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ──────────────────────────────────────────────────────────────────────────
-- AUDIT_LOGS
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY audit_logs_isolate ON audit_logs
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ──────────────────────────────────────────────────────────────────────────
-- REFRESH_TOKENS: no tiene tenantId directo → via users
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY refresh_tokens_isolate ON refresh_tokens
  FOR ALL
  USING (
    "userId" IN (
      SELECT id FROM users
      WHERE "tenantId" = current_setting('app.current_tenant_id', true)
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY subscriptions_isolate ON subscriptions
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ──────────────────────────────────────────────────────────────────────────
-- COLLECTION_LOGS
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY collection_logs_isolate ON collection_logs
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ──────────────────────────────────────────────────────────────────────────
-- CAF_RANGES
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY caf_ranges_isolate ON caf_ranges
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- ──────────────────────────────────────────────────────────────────────────
-- PUSH_SUBSCRIPTIONS
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY push_subscriptions_isolate ON push_subscriptions
  FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

-- 3. ROL EXTERNO DE SOLO LECTURA (para dashboards / contabilistas externos)
-- ============================================================================
-- CREATE ROLE pymeflow_readonly LOGIN PASSWORD 'cambia_esto';
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO pymeflow_readonly;
-- Este rol SÍ está sujeto a RLS. Requiere SET app.current_tenant_id antes de consultar.

-- 4. VERIFICACIÓN
-- ============================================================================
-- psql -U pymeflow -d pymeflow -c "\d+ invoices"
-- Debe mostrar "Row security: ENABLED" y las políticas listadas.

-- 5. TESTING EN PSQL
-- ============================================================================
-- SET app.current_tenant_id = 'id_del_tenant_a';
-- SELECT count(*) FROM invoices;  -- Solo facturas del tenant A

-- SET app.current_tenant_id = 'id_del_tenant_b';
-- SELECT count(*) FROM invoices;  -- Solo facturas del tenant B

-- RESET app.current_tenant_id;
-- SELECT count(*) FROM invoices;  -- 0 filas (seguro por defecto)

-- ============================================================================
