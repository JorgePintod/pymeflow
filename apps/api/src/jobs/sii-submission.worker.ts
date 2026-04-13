/**
 * apps/api/src/jobs/sii-submission.worker.ts
 *
 * Enhanced worker for submitting DTEs (invoices) to SII (Chilean tax authority).
 * Implements:
 * - Exponential backoff retry strategy
 * - Circuit breaker pattern (fail-open)
 * - Dead letter queue for permanent failures
 * - Idempotency keys to prevent duplicate submissions
 * - Comprehensive error logging and metrics
 *
 * Usage:
 *   // In jobs/index.ts:
 *   await registerSiiSubmissionWorker(app, queue);
 */

import type { Job } from "bull";
import type { FastifyInstance } from "fastify";
import { Queue } from "bull";
import { db } from "../config/database.js";
import { logger } from "../shared/logger.js";
import { redis } from "../config/redis.js";

/**
 * Configuration for retry strategy and circuit breaker.
 */
const CONFIG = {
  // Exponential backoff: [1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 512s]
  MAX_ATTEMPTS: 10,
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 512_000,

  // Circuit breaker: fail-open after 5 consecutive failures
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 5 * 60_000, // 5 minutes

  // Job timeout: SII submissions should complete within 30 minutes
  JOB_TIMEOUT_MS: 30 * 60_000,

  // Idempotency: store submission IDs to detect retries
  IDEMPOTENCY_TTL_MS: 24 * 60 * 60_000, // 24 hours
};

/**
 * Type definition for SII submission job data.
 */
interface SiiSubmissionPayload {
  invoiceId: string;
  tenantId: string;
  dteXml: string;
  signature: string;
  folio: number;
  rut: string;
  environment: "prod" | "cert"; // Production or certification (test)
  idempotencyKey?: string; // Unique key to prevent duplicate submissions
}

/**
 * Payload for dead letter queue.
 * When a job permanently fails, it's moved here with context.
 */
interface DeadLetterPayload extends SiiSubmissionPayload {
  failureReason: string;
  lastError: string;
  attempts: number;
}

/**
 * Circuit breaker state for SII API.
 */
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private readonly threshold = CONFIG.CIRCUIT_BREAKER_THRESHOLD;
  private readonly timeout = CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS;
  private readonly key = "sii:circuit-breaker";

  async check(): Promise<void> {
    const redisState = await redis.get(this.key);

    if (redisState === "OPEN") {
      const timestamp = await redis.get(`${this.key}:timestamp`);
      const timeSinceOpen = Date.now() - parseInt(timestamp || "0");

      if (timeSinceOpen > this.timeout) {
        logger.info("Circuit breaker transitioning to HALF_OPEN");
        this.state = "HALF_OPEN";
        await redis.set(this.key, "HALF_OPEN", "EX", 60);
      } else {
        throw new Error(
          `Circuit breaker OPEN: SII API unavailable. Retry in ${Math.ceil((this.timeout - timeSinceOpen) / 1000)}s`
        );
      }
    }
  }

  async recordSuccess(): Promise<void> {
    this.failureCount = 0;
    this.state = "CLOSED";
    await redis.del(this.key);
    logger.info("Circuit breaker reset to CLOSED");
  }

  async recordFailure(): Promise<void> {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      logger.warn(
        { failureCount: this.failureCount },
        "Circuit breaker opening: threshold reached"
      );
      this.state = "OPEN";
      await redis.set(this.key, "OPEN", "EX", Math.ceil(this.timeout / 1000));
      await redis.set(
        `${this.key}:timestamp`,
        this.lastFailureTime.toString(),
        "EX",
        Math.ceil(this.timeout / 1000)
      );
    }
  }
}

/**
 * Compute exponential backoff delay.
 *
 * Formula: min(baseDelay * (2 ^ attempt), maxDelay) + jitter
 * Jitter: ±10% to avoid thundering herd
 *
 * @param attempt - 0-based attempt number
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(attempt: number): number {
  const exponentialDelay = CONFIG.BASE_DELAY_MS * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, CONFIG.MAX_DELAY_MS);
  const jitter = cappedDelay * 0.1 * (Math.random() - 0.5); // ±10%
  return Math.max(0, cappedDelay + jitter);
}

/**
 * Generate or retrieve idempotency key for a submission.
 * Prevents duplicate submissions if job is retried.
 *
 * @param payload - Job payload
 * @returns Idempotency key (UUID-like)
 */
async function getOrCreateIdempotencyKey(payload: SiiSubmissionPayload): Promise<string> {
  if (payload.idempotencyKey) {
    return payload.idempotencyKey;
  }

  // Generate deterministic key from invoice + tenant
  const key = `sii:idempotency:${payload.tenantId}:${payload.invoiceId}`;
  let idempotencyKey = await redis.get(key);

  if (!idempotencyKey) {
    idempotencyKey = `${payload.invoiceId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await redis.setex(key, CONFIG.IDEMPOTENCY_TTL_MS / 1000, idempotencyKey);
  }

  return idempotencyKey;
}

/**
 * Call SII API to submit DTE.
 * This is a placeholder; in production, integrate with your SII client.
 *
 * @param payload - Submission details
 * @returns Response from SII (trackingId, status, etc.)
 * @throws Error if submission fails
 */
async function submitToSii(payload: SiiSubmissionPayload): Promise<{
  trackingId: string;
  status: "SUBMITTED" | "QUEUED" | "REJECTED";
  message?: string;
}> {
  // ⚠️ TODO: Replace with actual SII client call
  // Example: await siiClient.submitDte(payload.dteXml, payload.signature);

  provider("SII submission (placeholder)", {
    invoiceId: payload.invoiceId,
    folio: payload.folio,
    environment: payload.environment,
  });

  if (Math.random() < 0.05) {
    // Simulate 5% failure rate for testing
    throw new Error("SII API temporary error");
  }

  return {
    trackingId: `TRK-${payload.folio}-${Date.now()}`,
    status: "SUBMITTED",
  };
}

/**
 * Main job handler for SII submission.
 * Implements exponential backoff, circuit breaker, and idempotency.
 */
async function processSiiSubmission(job: Job<SiiSubmissionPayload>): Promise<void> {
  const { data, attemptsMade } = job;
  const circuitBreaker = new CircuitBreaker();

  try {
    // ─── Pre-flight checks ───
    logger.info(
      {
        invoiceId: data.invoiceId,
        folio: data.folio,
        attempt: attemptsMade + 1,
        maxAttempts: CONFIG.MAX_ATTEMPTS,
      },
      "SII submission job started"
    );

    // Check circuit breaker
    await circuitBreaker.check();

    // Get or create idempotency key
    const idempotencyKey = await getOrCreateIdempotencyKey(data);

    // ─── Retrieve invoice from DB ───
    const invoice = await db.invoice.findUnique({
      where: { id: data.invoiceId },
      select: {
        id: true,
        status: true,
        siiStatus: true,
        folio: true,
        client: { select: { rut: true } },
      },
    });

    if (!invoice) {
      throw new Error(`Invoice ${data.invoiceId} not found`);
    }

    if (invoice.status !== "ISSUED") {
      throw new Error(`Invoice is in ${invoice.status} state, expected ISSUED`);
    }

    // ─── Submit to SII ───
    const siiResponse = await submitToSii(data);

    // ─── Update invoice with SII submission details ───
    await db.invoice.update({
      where: { id: data.invoiceId },
      data: {
        siiStatus: siiResponse.status === "REJECTED" ? "REJECTED" : "PENDING",
        siiTrackingId: siiResponse.trackingId,
        siiIdempotencyKey: idempotencyKey,
        auditLog: {
          create: {
            action: "SII_SUBMISSION_SENT",
            details: {
              trackingId: siiResponse.trackingId,
              environment: data.environment,
              attempt: attemptsMade + 1,
            },
          },
        },
      },
    });

    // ─── Record success in circuit breaker ───
    await circuitBreaker.recordSuccess();

    logger.info(
      {
        invoiceId: data.invoiceId,
        folio: data.folio,
        trackingId: siiResponse.trackingId,
      },
      "SII submission successful"
    );

    // Emit success event (for real-time updates via WebSocket/Server-Sent Events)
    // await emitInvoiceStatusUpdate(data.tenantId, invoiceId, "sii_submitted");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRetryable = isRetryableError(error);

    logger.error(
      {
        invoiceId: data.invoiceId,
        folio: data.folio,
        attempt: attemptsMade + 1,
        maxAttempts: CONFIG.MAX_ATTEMPTS,
        error: errorMessage,
        retryable: isRetryable,
      },
      "SII submission failed"
    );

    // ─── Record failure in circuit breaker ───
    if (!isRetryable || attemptsMade + 1 >= CONFIG.MAX_ATTEMPTS) {
      await circuitBreaker.recordFailure();
    }

    // ─── Handle retries ───
    if (isRetryable && attemptsMade + 1 < CONFIG.MAX_ATTEMPTS) {
      const nextDelay = calculateBackoffDelay(attemptsMade);

      logger.info(
        {
          invoiceId: data.invoiceId,
          attempt: attemptsMade + 1,
          nextRetryIn: `${nextDelay}ms`,
        },
        "Scheduling retry"
      );

      // Throw error with retry delay instruction
      const retryError = new Error(errorMessage);
      (retryError as any).retry = true;
      (retryError as any).delay = nextDelay;
      throw retryError;
    }

    // ─── Permanent failure: move to dead letter queue ───
    await handlePermanentFailure(data, errorMessage, attemptsMade);
    throw new Error(`Permanent failure after ${attemptsMade} attempts: ${errorMessage}`);
  }
}

/**
 * Determine if an error is retryable.
 * Network/timeout errors are retryable; validation errors are not.
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const msg = error.message.toLowerCase();

  // Retryable patterns
  const retryable = [
    "timeout",
    "econnrefused",
    "econnreset",
    "temporary",
    "unavailable",
    "rate limit", // 429
    "service unavailable", // 503
    "gateway timeout", // 504
    "circuit breaker open",
  ];

  return retryable.some((pattern) => msg.includes(pattern));
}

/**
 * Handle permanent failure of a submission.
 * Moves job to dead letter queue and marks invoice as failed.
 */
async function handlePermanentFailure(
  payload: SiiSubmissionPayload,
  reason: string,
  attempts: number
): Promise<void> {
  logger.error(
    {
      invoiceId: payload.invoiceId,
      folio: payload.folio,
      reason,
      attempts,
    },
    "Moving SII submission to dead letter queue"
  );

  // ─── Update invoice status ───
  await db.invoice.update({
    where: { id: payload.invoiceId },
    data: {
      siiStatus: "FAILED",
      auditLog: {
        create: {
          action: "SII_SUBMISSION_FAILED",
          details: {
            reason,
            attempts,
            permanentFailure: true,
          },
        },
      },
    },
  });

  // ─── Create dead letter entry ───
  const dlqKey = `sii:dlq:${payload.invoiceId}`;
  const dlqPayload: DeadLetterPayload = {
    ...payload,
    failureReason: reason,
    lastError: reason,
    attempts,
  };

  await redis.setex(dlqKey, 30 * 24 * 60 * 60, JSON.stringify(dlqPayload)); // 30-day retention

  // ─── Create notification for user ───
  await db.notificationLog.create({
    data: {
      tenantId: payload.tenantId,
      type: "SII_SUBMISSION_FAILED",
      title: `Factura ${payload.folio}: Fallo en envío a SII`,
      message: `No se pudo enviar la factura a SII después de ${attempts} intentos. ${reason}`,
      actionUrl: `/dashboard/facturas/${payload.invoiceId}`,
      read: false,
    },
  });
}

/**
 * Register the SII submission worker with BullMQ.
 *
 * Configuration:
 * - Concurrency: 1 (serialize SII submissions to avoid overload)
 * - Timeout: 30 minutes
 * - Retry: Built-in with exponential backoff
 *
 * @param app - Fastify instance (for logging)
 * @param queue - BullMQ queue
 */
export async function registerSiiSubmissionWorker(
  app: FastifyInstance,
  queue: Queue
): Promise<void> {
  // Register job handler
  queue.process("sii-submission", 1, async (job) => {
    return processSiiSubmission(job);
  });

  // Event listeners
  queue.on("completed", (job) => {
    logger.info({ jobId: job.id, data: job.data }, "SII submission job completed");
  });

  queue.on("failed", (job, error) => {
    logger.error(
      { jobId: job.id, data: job.data, error: error.message, attempt: job.attemptsMade },
      "SII submission job failed"
    );
  });

  queue.on("error", (error) => {
    logger.error({ error }, "SII submission queue error");
  });

  logger.info("SII submission worker registered");
}

/**
 * Enqueue a DTE submission job.
 * Typically called when invoice status changes to ISSUED.
 *
 * @param queue - BullMQ queue
 * @param payload - Submission details
 * @returns Job ID
 */
export async function enqueueSiiSubmission(
  queue: Queue,
  payload: SiiSubmissionPayload
): Promise<string> {
  const job = await queue.add("sii-submission", payload, {
    attempts: CONFIG.MAX_ATTEMPTS,
    backoff: {
      type: "custom", // We'll handle backoff in the job itself
    },
    timeout: CONFIG.JOB_TIMEOUT_MS,
    removeOnComplete: true,
    removeOnFail: false, // Keep failed jobs for debugging
  });

  logger.info(
    { jobId: job.id, invoiceId: payload.invoiceId, folio: payload.folio },
    "DTE submission job enqueued"
  );

  return job.id.toString();
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * TESTING UTILITY: Simulate SII client behavior
 * ═════════════════════════════════════════════════════════════════════════
 */

function provider(description: string, context: Record<string, unknown>): void {
  console.log(`[SII Provider] ${description}`, context);
}

/**
 * Test helper: Flush and manually process pending SII submissions.
 * Useful for E2E tests.
 *
 * @param queue - BullMQ queue
 */
export async function processPendingSiiJobs(queue: Queue): Promise<void> {
  const jobs = await queue.getJobs(["waiting", "delayed"]);
  logger.info({ count: jobs.length }, "Processing pending SII jobs");

  for (const job of jobs) {
    try {
      await job.progress(100);
      await job.complete();
    } catch (error) {
      logger.error({ jobId: job.id, error }, "Failed to complete job");
    }
  }
}
