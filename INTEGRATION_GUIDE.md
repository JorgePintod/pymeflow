/**
 * INTEGRATION_GUIDE.md
 *
 * Guide to integrate the 5 corrective code files into PymeFlow.
 * This document explains what each file does, why it matters, and how to use it.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * OVERVIEW
 * ═════════════════════════════════════════════════════════════════════════
 *
 * This security audit identified 8 critical vulnerabilities in PymeFlow:
 *
 * 🔴 HIGH SEVERITY (5):
 *   1. No centralized tenant isolation → easy data leaks
 *   2. No retry logic for SII submissions → silent failures
 *   3. Missing DTE receipt webhook endpoint → incomplete cash flow
 *   4. No webhook signature verification → spoofed DTEs accepted
 *   5. $queryRaw not protected → developers can leak all data
 *
 * 🟡 MEDIUM SEVERITY (3):
 *   6. No transaction boundaries → inconsistent state on failures
 *   7. No job timeout configured → jobs can hang indefinitely
 *   8. No idempotency keys → duplicate DTE submissions to SII
 *
 * ═════════════════════════════════════════════════════════════════════════
 * SOLUTION: 5 CORRECTIVE CODE FILES
 * ═════════════════════════════════════════════════════════════════════════
 *
 * 1. apps/api/src/middleware/tenant-isolation.middleware.ts
 *    ├─ Addresses: Vulnerabilities #1, #5 (centralized isolation)
 *    ├─ Features:
 *    │  ├─ Fastify preHandler: Injects tenantId into request context
 *    │  ├─ Prisma middleware: Auto-filters ALL queries by tenantId
 *    │  ├─ AsyncLocalStorage: Cross-async context tracking
 *    │  └─ Audit logging: Detects attempted cross-tenant access
 *    ├─ File size: ~300 lines
 *    └─ Integration time: 15 minutes
 *
 * 2. apps/api/src/jobs/sii-submission.worker.ts
 *    ├─ Addresses: Vulnerabilities #2, #7, #8 (retry + idempotency)
 *    ├─ Features:
 *    │  ├─ Exponential backoff: 1s → 512s with ±10% jitter
 *    │  ├─ Circuit breaker: Fail-open after 5 consecutive failures
 *    │  ├─ Dead letter queue: 30-day retention for permanent failures
 *    │  ├─ Idempotency keys: 24-hour tracking prevents duplicates
 *    │  └─ Comprehensive audit trail
 *    ├─ File size: ~400 lines
 *    └─ Integration time: 20 minutes
 *
 * 3. apps/api/src/modules/webhooks/sii-dte.webhook.ts
 *    ├─ Addresses: Vulnerabilities #3, #4 (incoming DTEs + verification)
 *    ├─ Features:
 *    │  ├─ HMAC-SHA256 signature verification (timing-safe)
 *    │  ├─ Tenant routing by DTE recipient RUT
 *    │  ├─ Cash flow entry creation
 *    │  ├─ Duplicate detection via idempotency keys
 *    │  └─ Supplier auto-creation
 *    ├─ File size: ~320 lines
 *    └─ Integration time: 30 minutes (+ Prisma schema update)
 *
 * 4. apps/api/prisma/seed.ts (UPDATED)
 *    ├─ Comprehensive test data generation
 *    ├─ Features:
 *    │  ├─ 3 demo tenants with isolated data
 *    │  ├─ 10 clients + 50 invoices + 30 expenses per tenant
 *    │  ├─ Various invoice statuses (DRAFT, ISSUED, PAID, etc.)
 *    │  ├─ CAF ranges + subscriptions + cash flow entries
 *    │  └─ User-friendly output with demo credentials
 *    ├─ File size: ~280 lines
 *    └─ Integration time: 5 minutes (rename only)
 *
 * 5. apps/api/src/jobs/queue-config.ts
 *    ├─ Addresses: Vulnerabilities #2, #7, #8 (queue configuration)
 *    ├─ Features:
 *    │  ├─ Exponential backoff configuration builder
 *    │  ├─ Idempotency key management
 *    │  ├─ Dead letter queue handler (30-day retention)
 *    │  ├─ Metrics recording hooks
 *    │  ├─ Preset configurations (FAST, SLOW, CRITICAL)
 *    │  └─ Graceful shutdown
 *    ├─ File size: ~320 lines
 *    └─ Integration time: 10 minutes
 *
 * ═════════════════════════════════════════════════════════════════════════
 * STEP-BY-STEP INTEGRATION
 * ═════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────
// STEP 1: Prisma Schema Updates (10 minutes)
// ─────────────────────────────────────────────────────────────────────────

/*
File: apps/api/prisma/schema.prisma

Add these new models for DTE webhook support:

  model DteReceived {
    id                 String   @id @default(cuid())
    tenantId           String
    tenant             Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

    documentType       String   // "FACTURA", "NOTA_CREDITO", etc.
    folio              Int
    emissionDate       DateTime

    issuerRut          String   // Supplier RUT
    issuerName         String
    recipientRut       String   // Our RUT
    
    netAmount          BigInt
    tax                BigInt
    totalAmount        BigInt
    
    dteXmlBase64       String   @db.Text // Full DTE XML
    signature          String   @db.Text
    idempotencyKey     String   @unique
    
    status             String   @default("RECEIVED") // RECEIVED, PROCESSED, FAILED
    rawMetadata        Json?    // Additional data
    
    createdAt          DateTime @default(now())
    updatedAt          DateTime @updatedAt
    
    @@unique([tenantId, folio, issuerRut])
    @@index([tenantId])
    @@index([idempotencyKey])
  }

After adding to schema:
  1. npx prisma migrate dev --name add_dte_received
  2. npx prisma generate
*/

// ─────────────────────────────────────────────────────────────────────────
// STEP 2: Update server.ts to register tenant isolation (15 minutes)
// ─────────────────────────────────────────────────────────────────────────

/*
File: apps/api/src/server.ts

Import:
  import { setupTenantIsolation } from "./middleware/tenant-isolation.middleware.js";

In buildApp() function, AFTER all plugin registrations, add:

  // Setup tenant isolation (must be AFTER auth but BEFORE routes)
  await app.addHook("preHandler", authenticate);
  await app.addHook("preHandler", tenantContextHandler);
  await setupTenantIsolation(app);

This ensures:
  - Every request has tenantId in context
  - Every Prisma query is auto-filtered by tenantId
  - Developers can't accidentally leak cross-tenant data
*/

// ─────────────────────────────────────────────────────────────────────────
// STEP 3: Create webhooks routes file (20 minutes)
// ─────────────────────────────────────────────────────────────────────────

/*
File: apps/api/src/modules/webhooks/webhooks.routes.ts (NEW)

Example:
  import type { FastifyInstance } from "fastify";
  import {
    handleSiiDteWebhook,
    verifyWebhookSignature,
  } from "./sii-dte.webhook.js";

  export async function registerWebhookRoutes(app: FastifyInstance) {
    // PUBLIC routes (no auth required, but signature verified)
    app.post(
      "/webhooks/sii/dte-received",
      {
        onRequest: [verifyWebhookSignature],
        schema: {
          description: "Receive incoming DTE from SII intermediary",
          body: {
            type: "object",
            required: ["documentType", "folio", "recipientRut", "dteXml"],
            properties: {
              documentType: { type: "string" },
              folio: { type: "number" },
              emissionDate: { type: "string" },
              issuerRut: { type: "string" },
              issuerName: { type: "string" },
              recipientRut: { type: "string" },
              netAmount: { type: "number" },
              tax: { type: "number" },
              totalAmount: { type: "number" },
              dteXml: { type: "string" },
              signature: { type: "string" },
              idempotencyKey: { type: "string" },
              timestamp: { type: "number" },
            },
          },
        },
      },
      handleSiiDteWebhook
    );
  }

Then register in server.ts:
  import { registerWebhookRoutes } from "./modules/webhooks/webhooks.routes.js";
  await registerWebhookRoutes(app);
*/

// ─────────────────────────────────────────────────────────────────────────
// STEP 4: Update jobs/index.ts to use new SII worker (30 minutes)
// ─────────────────────────────────────────────────────────────────────────

/*
File: apps/api/src/jobs/index.ts

Replace the SII submission logic with the new worker:

  import {
    registerSiiSubmissionWorker,
    enqueueSiiSubmission,
  } from "./sii-submission.worker.js";

  export async function initializeJobs(app: FastifyInstance) {
    // ... existing code ...

    // Register the improved SII worker (replaces old collection.job.ts logic)
    await registerSiiSubmissionWorker(app, queue);

    return { queue };
  }

Usage in invoices service:
  // When an invoice is emitted:
  await enqueueSiiSubmission(queue, {
    invoiceId: invoice.id,
    tenantId: invoice.tenantId,
    dteXml: xmlContent,
    signature: digitalSignature,
    folio: invoice.folio,
    rut: tenant.rut,
    environment: "prod",
  });

This automatically:
  - Creates idempotency keys
  - Retries with exponential backoff
  - Tracks in dead letter queue on permanent failure
*/

// ─────────────────────────────────────────────────────────────────────────
// STEP 5: Environment variables (.env.local) (5 minutes)
// ─────────────────────────────────────────────────────────────────────────

/*
Add to .env.local:

  # Webhook signature verification
  WEBHOOK_SECRET_SII_DTE=your-secret-key-here-min-32-chars

  # For production, rotate this key quarterly and update all SII intermediaries
*/

// ─────────────────────────────────────────────────────────────────────────
// STEP 6: Database seed (5 minutes)
// ─────────────────────────────────────────────────────────────────────────

/*
File: apps/api/package.json

Update scripts:
  "scripts": {
    ...existing...
    "seed": "tsx prisma/seed.ts"
  }

Run:
  npm run seed

This creates:
  - 3 demo tenants (Constructora Norte, TechSolutions, Comercial Sur)
  - 30 clients (10 per tenant)
  - 150 invoices (50 per tenant) with various statuses
  - 90 expenses (30 per tenant)
  - Cash flow entries + notifications
  
Output shows demo credentials for each tenant.
*/

// ─────────────────────────────────────────────────────────────────────────
// STEP 7: Update queue configuration in jobs/index.ts (10 minutes)
// ─────────────────────────────────────────────────────────────────────────

/*
File: apps/api/src/jobs/index.ts

Import:
  import {
    createQueueWithConfig,
    PRESETS,
    getOrCreateIdempotencyKey,
    createJobOptions,
  } from "./queue-config.js";

Use:
  // Create queue with critical configuration (for SII submissions)
  const siiQueue = createQueueWithConfig(
    "sii-submissions",
    PRESETS.CRITICAL // 20 retries, 1hr timeout, 1 concurrency
  );

  // Or for fast parallel jobs:
  const emailQueue = createQueueWithConfig(
    "emails",
    PRESETS.FAST_PARALLEL // 3 retries, 5 concurrency
  );

The configuration automatically handles:
  - Exponential backoff
  - Idempotency keys
  - Dead letter queue
  - Metrics recording
*/

// ─────────────────────────────────────────────────────────────────────────
// TESTING CHECKLIST
// ─────────────────────────────────────────────────────────────────────────

/*
After integration, verify:

✓ Tenant Isolation:
  1. Login as tenant A, create invoice
  2. Login as tenant B, check they DON'T see tenant A's invoices
  3. Check server logs for "Tenant context initialized"

✓ SII Submission Worker:
  1. Create invoice and emit it
  2. Watch server for: "SII submission job started"
  3. Kill Redis to simulate failure
  4. Verify job retries with exponential backoff
  5. After max attempts, verify it's in dead letter queue

✓ DTE Webhook:
  1. Generate mock DTE with computeMockSignature()
  2. POST to /api/v1/webhooks/sii/dte-received
  3. Verify cash flow entry created
  4. Verify duplicate rejected on retry
  5. Check supplier auto-created

✓ Seed Data:
  1. Run: npm run seed
  2. Login with generated credentials
  3. Verify 3 tenants, 30 clients, 150 invoices visible
  4. Verify data isolated by tenant

✓ Queue Metrics:
  1. Check Redis for keys: job:metrics:*
  2. Verify job completion/failure counts updated
  3. Check DLQ entries: dlq:sii-submissions:*
*/

// ─────────────────────────────────────────────────────────────────────────
// SECURITY IMPROVEMENTS SUMMARY
// ─────────────────────────────────────────────────────────────────────────

/*
Before (Vulnerable):
  ❌ Manual tenantId validation in each service → easy to miss
  ❌ No retry logic → silent failure → customer doesn't get invoice in SII
  ❌ No incoming DTE support → cash flow incomplete
  ❌ No idempotency → duplicate submissions to SII (legal/audit risk)

After (Secured):
  ✅ Automatic Prisma middleware filters ALL queries by tenantId
  ✅ Exponential backoff + circuit breaker + DLQ + audit trail
  ✅ Webhook handler validates signatures + creates cash flow entries
  ✅ Idempotency keys prevent duplicate SII submissions (24-hour tracking)
  ✅ Comprehensive metrics + monitoring hooks ready for observability
  ✅ Seed script enables fast E2E testing with multi-tenant data

Impact on operations:
  - Security: Vulnerable → Production-ready
  - Resilience: Immediate failure → Auto-retry + manual replay capability
  - Auditability: None → Audit trail + DLQ forensics
  - Performance: Manual validation → Automatic + cached idempotency keys
*/

// ─────────────────────────────────────────────────────────────────────────
// ROLLOUT STRATEGY
// ─────────────────────────────────────────────────────────────────────────

/*
Phase 1: Development (1-2 days)
  1. Apply all 5 files to dev environment
  2. Update Prisma schema, run migrations
  3. Run npm run seed
  4. Execute manual testing checklist
  5. Verify no TypeScript errors: npm run build

Phase 2: Staging (3-5 days)
  1. Deploy to staging
  2. Load test: generate 1000 invoices, emit all
  3. Simulate SII failures, verify retries work
  4. Test webhook with real DTE samples
  5. Monitor metrics + logs for anomalies

Phase 3: Production (1 day, with rollback plan)
  1. Deploy at low-traffic time (e.g., 2 AM)
  2. Monitor: job failures, queue latency, error rates
  3. Verify tenant isolation enforced on real data
  4. Gradual traffic increase (canary deployment)
  5. Rollback plan: Keep old worker, disable new one via feature flag

Health checks:
  - GET /api/v1/health → should return 200 OK
  - Check Redis: should have idempotency keys + metrics
  - Check DLQ: should be empty (or have only expected entries)
  - Tenant isolation: login as different tenants, verify isolation
*/

// ═════════════════════════════════════════════════════════════════════════
// QUESTIONS?
// ═════════════════════════════════════════════════════════════════════════

/*
For questions about:
  - Tenant isolation → read tenant-isolation.middleware.ts JSDoc
  - Retry logic → read sii-submission.worker.ts and queue-config.ts
  - Webhooks → read sii-dte.webhook.ts (includes testing helpers)
  - Seed data → read prisma/seed.ts and run with --help flag
  - Queue configuration → read queue-config.ts presets and examples

All files have extensive JSDoc comments and usage examples.
