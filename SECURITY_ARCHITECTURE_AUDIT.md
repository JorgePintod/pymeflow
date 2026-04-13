# PymeFlow - Security & Architecture Audit Report
**Date**: April 2026 | **Auditor Role**: Senior Software Architect + QA Automation Engineer

---

## Executive Summary

PymeFlow is a SaaS multi-tenant accounting platform with a complex workflow involving:
- User registration & authentication (Fastify + JWT)
- DTE (Electronic Tax Document) lifecycle management
- Integration with Chilean SII (Tax Authority)
- Automated collection workflows (BullMQ)
- Webhook-driven events (Stripe subscriptions)

**Critical Findings**: 5 HIGH-severity issues, 3 MEDIUM-severity issues detected.

---

## SECTION 1: SIMULATED TENANT LIFECYCLE FLOW

### 1.1 Registration Flow
```
POST /api/v1/auth/register
  └─> Validate email, password, businessName, RUT
  └─> Create Tenant record
  └─> Create initial User (OWNER role)
  └─> Issue JWT tokens (access + refresh)
  └─> Return tokens to frontend
  └─> Frontend stores in localStorage → logged in
```

**Status**: ✅ Implemented correctly (reviewed auth.service.ts)

---

### 1.2 DTE (Invoice) Issuance Flow
```
POST /api/v1/invoices (Borrador/Draft)
  ├─> Check tenantId matches user
  ├─> Validate clientId belongs to tenant
  ├─> Create Invoice (status=DRAFT, siiStatus=DRAFT)
  ├─> Assign items
  └─> Return folio=null (pending)

POST /api/v1/invoices/:id/issue (Emit)
  ├─> Load invoice, validate draft status
  ├─> Fetch available CAF range for tenant
  ├─> Assign folio from CAF
  ├─> Sign XML with tenant's .p12 certificate
  ├─> Create DTE (XML signed)
  ├─> Update siiStatus=PENDING
  ├─> Queue to BullMQ for SII submission
  └─> Return invoice (folio now set)

POST /api/v1/invoices/:id/send (Send to SII)
  ├─> Load invoice (status=ISSUED)
  ├─> Call SII middleware API → POST their /endpoint
  ├─> Receive Track ID
  ├─> Store in invoice.siiTrackId
  ├─> Add polling job to verify acceptance
  └─> Update siiStatus=SENT
```

**Status**: ✅ Mostly implemented, but see issues below.

---

### 1.3 Incoming DTE (Compra/Receipt) Webhook Flow
```
POST /webhook/dte-received (from SII middleware)
  ├─> Verify signature/IP (no tenant context yet!)
  ├─> Parse DTE XML
  ├─> Extract RUT_RECEPTOR (target tenant)
  ├─> Find Tenant by rut_normalized
  ├─> Create DTE_RECEIVED record
  ├─> Create CashflowEntry (INGRESO/incoming)
  ├─> Create PushNotification to tenant users
  └─> Return 200 OK
  
[Note: This flow does NOT exist in current codebase!]
```

**Status**: ❌ NOT IMPLEMENTED — Critical gap.

---

### 1.4 Nightly Cash Flow Update Job
```
BullMQ Worker: "daily-cashflow-update" (cron 8 AM Chile time)
  ├─> For EACH active Tenant:
  │   ├─> Sum invoices issued in last 30/60/90 days
  │   ├─> Sum expenses recorded in last 30/60/90 days  
  │   ├─> Sum payments received in last 30/60/90 days
  │   ├─> Calculate projected cash (pending invoices - pending expenses)
  │   ├─> Mark overdue invoices (dueDate < today)
  │   ├─> Create CashflowProjection records
  │   └─> Schedule collection jobs for overdue invoices
  └─> Handle retries with exponential backoff
```

**Status**: ⚠️ Partially implemented (no exponential backoff, no retry logic).

---

## SECTION 2: VULNERABILITIES & ARCHITECTURAL GAPS

### 🔴 HIGH SEVERITY

#### 1. **Lack of Centralized Tenant Isolation Middleware**
**Impact**: Data leakage between tenants (HIGH)

**Problem**:
- Every service manually validates `tenantId` in query WHERE clauses
- Easy to miss in new features → security vulnerability
- No enforcement at DB layer or ORM layer

**Example of Risk**:
```typescript
// Vulnerable (current approach):
const client = await db.client.findUnique({
  where: { id: clientId }  // ❌ Missing tenantId check!
});
// User A can read User B's client if they guess the ID
```

**Attack Vector**:
```bash
# User from Tenant A sends:
GET /api/v1/clients/xyz123
# If xyz123 belongs to Tenant B, they get it anyway
# (Currently, the route DOES pass tenantId, but no guarantee on ALL routes)
```

**Recommendation**: ✅ See "TENANT_ISOLATION_MIDDLEWARE.ts" for fix

---

#### 2. **No Retry Logic with Exponential Backoff in SII Integration**
**Impact**: Data sync failures, lost invoices (HIGH)

**Problem**:
- If SII middleware API is temporarily down, jobs fail silently
- No automatic retry with exponential backoff
- No circuit breaker to prevent cascading failures
- BullMQ default is 3 retries with LINEAR backoff

**Current Code** (`collection.job.ts`):
```typescript
// No retry config visible — job fails and is buried
await whatsappService.sendCollectionMessage({ ... });
```

**Recommendation**: ✅ See "IMPROVED_SII_SUBMISSION_WORKER.ts" for fix with:
- Exponential backoff (base 2, max 10 attempts)
- Circuit breaker pattern
- Dead letter queue for permanent failures

---

#### 3. **DTE Receipt Webhook Endpoint Missing**
**Impact**: Incoming purchase DTEs not processed (HIGH)

**Problem**:
- Only Stripe webhook handler exists
- No endpoint for SII middleware to POST incoming DTEs
- Cash flow cannot reflect incoming purchases from suppliers

**Recommendation**: ✅ See "DTE_WEBHOOK_HANDLER.ts" for new endpoint

---

#### 4. **No Signature Verification on Webhooks (SII DTEs)**
**Impact**: Authentication/Authorization bypass (HIGH)

**Problem**:
- Would receive DTEs from external SII intermediary
- Must cryptographically verify sender (IP whitelist insufficient)

**Recommendation**: Implement webhook signature verification using HMAC-SHA256

---

#### 5. **Raw SQL Queries Not Protected by Tenant Filter**
**Impact**: Potential for bulk data leakage (HIGH)

**Problem**:
```typescript
// If developer uses $queryRaw without tenant filter:
const invoices = await db.$queryRaw`SELECT * FROM invoices`;
// ❌ Returns ALL invoices from ALL tenants!
```

**Recommendation**: 
- Add Prisma middleware to intercept $queryRaw and enforce tenantId
- OR: Document strict rule: "Never use $queryRaw, use models only"

---

### 🟡 MEDIUM SEVERITY

#### 6. **No Transaction Boundaries for Multi-Step Operations**
**Impact**: Data inconsistency on partial failures

**Problem**:
1. Create Invoice
2. Assign Folio (fail here)
3. Sign XML (never reached)
→ Invoice left in inconsistent state

**Recommendation**: Use Prisma `$transaction` for atomic operations

---

#### 7. **Job Timeout Not Configured**
**Impact**: Jobs hang indefinitely, block queue

**Problem**:
```typescript
new Worker(SCHEDULER_QUEUE, async () => {
  // If this takes >30m, BullMQ kills it without cleanup
}, { connection: redis, concurrency: 1 });
```

**Recommendation**: Set `jobOptions.timeout` and verify all external API calls have timeouts

---

#### 8. **No Idempotency Key for DTE Submissions**
**Impact**: Duplicate DTEs submitted to SII if job retry triggered

**Problem**:
- Submit DTE → API returns 200 OK → Response lost → Job retries
- DTE submitted twice to SII = rejected by tax authority

**Recommendation**: Use idempotency keys (UUID generated once per submission attempt)

---

## SECTION 3: RECOMMENDED FIXES

### Implementation Priority
1. **CRITICAL**: Tenant Isolation Middleware (prevents data leaks)
2. **CRITICAL**: DTE Webhook Receiver (enables purchase DTE workflow)
3. **HIGH**: SII Worker with Exponential Backoff
4. **HIGH**: Idempotency Keys for SII Submissions
5. **MEDIUM**: Seed Script (enables QA & feature development)

---

## SECTION 4: CODE DELIVERABLES

See the following generated files:

1. **TENANT_ISOLATION_MIDDLEWARE.ts** — Fastify preHandler + Prisma middleware
2. **IMPROVED_SII_SUBMISSION_WORKER.ts** — BullMQ worker with backoff & circuit breaker
3. **DTE_WEBHOOK_HANDLER.ts** — Endpoint to receive incoming purchase DTEs
4. **SEED_SCRIPT.ts** — TypeScript script to populate test database
5. **IMPROVED_QUEUE_CONFIG.ts** — Enhanced queue with idempotency & retries

---

## Testing Recommendations

### Unit Tests
- Middleware: Verify tenantId injection on all DB calls
- Worker: Test backoff calculation (1s, 2s, 4s, 8s, 16s, ...)
- Webhook: Verify signature validation + DTE parsing

### Integration Tests
- Create invoice → emit → check SII status → verify in cash flow
- Webhook receives DTE → check created CashflowEntry
- Worker job retries 3 times on API failure

### Load Tests
- 1000 concurrent invoice creations from 100 tenants
- Verify no cross-tenant data leaks
- BullMQ queue processes 10k jobs/minute without hanging

---

## Deployment Checklist
- [ ] Enable Prisma middleware for tenant filtering
- [ ] Deploy updated worker with exponential backoff
- [ ] Register DTE webhook endpoint  
- [ ] Configure SII middleware IP whitelist  
- [ ] Test with SII certification environment first  
- [ ] Migrate existing jobs to new queue config  
- [ ] Monitor BullMQ dashboard during first 24h  

---

**Report Signed**: Senior Architect | Date: April 13, 2026
