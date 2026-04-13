-- ============================================================================
-- SCRIPT DE ROW LEVEL SECURITY (RLS) PARA PYMEFLOW
-- ============================================================================
-- Este script debe ejecutarse en la base de datos PostgreSQL de producción
-- para habilitar Row Level Security en todas las tablas multi-tenant.
-- 
-- Ejecución:
-- psql -h localhost -U pymeflow -d pymeflow_dev -f enable-rls.sql
-- ============================================================================

-- 1. HABILITAR RLS EN TODAS LAS TABLAS MULTI-TENANT
-- ============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- 2. CREAR POLÍTICAS RLS
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- TENANTS: Solo el owner/admin del tenant ve su propio tenant
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY tenants_isolate ON tenants
  FOR ALL
  USING (id = current_setting('app.current_tenant_id'));

CREATE POLICY tenants_insert ON tenants
  FOR INSERT
  WITH CHECK (true);  -- Permitir creación de nuevos tenants

-- ──────────────────────────────────────────────────────────────────────────
-- USERS: Solo los usuarios del mismo tenant
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY users_isolate ON users
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id'));

-- ──────────────────────────────────────────────────────────────────────────
-- CLIENTS: Solo los clientes del tenant
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY clients_isolate ON clients
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id'));

-- ──────────────────────────────────────────────────────────────────────────
-- INVOICES: Solo las facturas del tenant
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY invoices_isolate ON invoices
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id'));

-- ──────────────────────────────────────────────────────────────────────────
-- INVOICE_ITEMS: Solo los ítems de facturas del tenant
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY invoice_items_isolate ON invoice_items
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices 
      WHERE tenant_id = current_setting('app.current_tenant_id')
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- PAYMENTS: Solo los pagos de facturas del tenant
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY payments_isolate ON payments
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices 
      WHERE tenant_id = current_setting('app.current_tenant_id')
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- EXPENSES: Solo los gastos del tenant
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY expenses_isolate ON expenses
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id'));

-- ──────────────────────────────────────────────────────────────────────────
-- CASHFLOW_ENTRIES: Solo los movimientos del tenant
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY cashflow_entries_isolate ON cashflow_entries
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id'));

-- ──────────────────────────────────────────────────────────────────────────
-- NOTIFICATIONS: Solo las notificaciones del tenant
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY notifications_isolate ON notifications
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id'));

-- ──────────────────────────────────────────────────────────────────────────
-- AUDIT_LOGS: Solo los logs del tenant
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY audit_logs_isolate ON audit_logs
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id'));

-- ──────────────────────────────────────────────────────────────────────────
-- REFRESH_TOKENS: Solo los refresh tokens del usuario
-- ──────────────────────────────────────────────────────────────────────────
CREATE POLICY refresh_tokens_isolate ON refresh_tokens
  FOR ALL
  USING (
    user_id IN (
      SELECT id FROM users 
      WHERE tenant_id = current_setting('app.current_tenant_id')
    )
  );

-- 3. VERIFICACIÓN
-- ============================================================================
-- Ejecutar esto para verificar que RLS está habilitado:
-- \d+ <table_name>
-- Debería mostrar "Row security: ENABLED" y las políticas en "Policies:"

-- Ejemplo:
-- \d+ invoices

-- 4. TESTING
-- ============================================================================
-- En una sesión de psql, probar:
-- SET app.current_tenant_id = 'tenant_a_id';
-- SELECT * FROM invoices; -- Solo muestra facturas de tenant_a_id

-- SET app.current_tenant_id = 'tenant_b_id';
-- SELECT * FROM invoices; -- Solo muestra facturas de tenant_b_id

-- SELECT * FROM invoices; -- SIN SET: devuelve 0 filas (seguro por defecto)

-- ============================================================================
-- FIN SCRIPT RLS
-- ============================================================================
