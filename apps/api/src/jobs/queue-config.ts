/**
 * apps/api/src/jobs/queue-config.ts
 *
 * Enhanced BullMQ queue configuration with:
 * - Idempotency key support (prevent duplicate jobs)
 * - Improved retry settings with exponential backoff
 * - Job timeout constraints
 * - Dead letter queue (DLQ) for permanent failures
 * - Comprehensive metrics and monitoring hooks
 *
 * Usage:
 *   // In jobs/index.ts:
 *   import { configureQueue, createQueueWithConfig } from "./queue-config.js";
 *
 *   const queue = await createQueueWithConfig("sii-submissions");
 */

import type { Queue, Job, JobOptions } from "bull";
import { Queue } from "bull";
import { redis } from "../config/redis.js";
import { logger } from "../shared/logger.js";

/**
 * Advanced queue configuration options.
 */
export interface AdvancedQueueConfig {
  // Job lifecycle
  maxAttempts: number;
  maxDelayMs: number;
  baseDelayMs: number;
  timeoutMs: number;

  // Idempotency
  idempotencyTtlMs: number;

  // Dead letter queue
  dlqEnabled: boolean;
  dlqRetentionMs: number;

  // Metrics
  enableMetrics: boolean;
  metricsPrefix: string;

  // Concurrency
  concurrency: number;
}

/**
 * Default configuration for production.
 */
export const DEFAULT_CONFIG: AdvancedQueueConfig = {
  maxAttempts: 10,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 512_000, // ~8.5 minutes
  timeoutMs: 30 * 60_000, // 30 minutes

  idempotencyTtlMs: 24 * 60 * 60_000, // 24 hours
  dlqEnabled: true,
  dlqRetentionMs: 30 * 24 * 60 * 60_000, // 30 days

  enableMetrics: true,
  metricsPrefix: "job:metrics:",

  concurrency: 1, // Serialize jobs by default
};

/**
 * Configuration presets for common use cases.
 */
export const PRESETS = {
  FAST_PARALLEL: {
    ...DEFAULT_CONFIG,
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 10_000,
    concurrency: 5,
  },
  SLOW_SERIAL: {
    ...DEFAULT_CONFIG,
    maxAttempts: 15,
    baseDelayMs: 5000,
    maxDelayMs: 60_000 * 10, // 10 minutes
    concurrency: 1,
  },
  CRITICAL: {
    ...DEFAULT_CONFIG,
    maxAttempts: 20, // More retries for critical jobs
    baseDelayMs: 500,
    maxDelayMs: 60_000 * 30, // 30 minutes
    concurrency: 1,
    timeoutMs: 60 * 60_000, // 1 hour
  },
};

/**
 * Compute exponential backoff delay with jitter.
 *
 * Formula: min(baseDelay * 2^attempt, maxDelay) + jitter(±10%)
 *
 * @param attempt - 0-based attempt number
 * @param config - Queue configuration
 * @returns Delay in milliseconds
 */
export function calculateExponentialBackoff(
  attempt: number,
  config: AdvancedQueueConfig
): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  
  // Add ±10% jitter to avoid thundering herd
  const jitter = cappedDelay * 0.1 * (Math.random() - 0.5);
  
  return Math.max(0, cappedDelay + jitter);
}

/**
 * Get or create idempotency key for a job.
 * Prevents duplicate job submissions.
 *
 * Usage:
 *   const idempotencyKey = await getOrCreateIdempotencyKey("sii", invoiceId);
 *   queue.add("submit", data, { ...options, idempotencyKey });
 *
 * @param prefix - Job type prefix (e.g., "sii", "email")
 * @param entityId - Unique entity identifier
 * @param config - Queue configuration
 * @returns Idempotency key (UUID-like)
 */
export async function getOrCreateIdempotencyKey(
  prefix: string,
  entityId: string,
  config: AdvancedQueueConfig
): Promise<string> {
  const redisKey = `idempotency:${prefix}:${entityId}`;
  
  let key = await redis.get(redisKey);
  
  if (!key) {
    key = `${prefix}-${entityId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await redis.setex(
      redisKey,
      Math.ceil(config.idempotencyTtlMs / 1000),
      key
    );
  }
  
  return key;
}

/**
 * Check if a job with this idempotency key already exists.
 *
 * @param idempotencyKey - Idempotency key
 * @returns true if job exists
 */
export async function idempotencyKeyExists(idempotencyKey: string): Promise<boolean> {
  const redisKey = `job:idempotency:${idempotencyKey}`;
  return (await redis.exists(redisKey)) > 0;
}

/**
 * Record idempotency key as used (prevent duplicates).
 *
 * @param idempotencyKey - Idempotency key
 * @param ttlMs - Time-to-live in milliseconds
 */
export async function recordIdempotencyKey(
  idempotencyKey: string,
  ttlMs: number = 24 * 60 * 60_000
): Promise<void> {
  const redisKey = `job:idempotency:${idempotencyKey}`;
  await redis.setex(redisKey, Math.ceil(ttlMs / 1000), "1");
}

/**
 * Create enhanced job options with retry/backoff/etc.
 *
 * @param config - Queue configuration
 * @param options - Base job options to merge
 * @returns Job options for Bull
 */
export function createJobOptions(
  config: AdvancedQueueConfig,
  options?: Partial<JobOptions>
): JobOptions {
  return {
    attempts: config.maxAttempts,
    timeout: config.timeoutMs,
    backoff: {
      type: "custom",
    },
    removeOnComplete: true,
    removeOnFail: !config.dlqEnabled,
    ...options,
  };
}

/**
 * Create and configure a new BullMQ queue with advanced settings.
 *
 * @param queueName - Queue name
 * @param config - Advanced configuration (defaults to DEFAULT_CONFIG)
 * @returns Configured Queue instance
 */
export function createQueueWithConfig(
  queueName: string,
  config: AdvancedQueueConfig = DEFAULT_CONFIG
): Queue {
  const queue = new Queue(queueName, {
    redis,
    settings: {
      maxStalledCount: 2,
      maxRetriesPerSecond: 5,
      retryProcessDelay: 5_000, // 5 seconds
      lockDuration: 30_000, // 30 seconds
      lockRenewTime: 15_000, // 15 seconds
    },
  });

  // ─── Setup event listeners ───
  setupQueueListeners(queue, config);

  return queue;
}

/**
 * Setup comprehensive event listeners for queue monitoring.
 *
 * @param queue - BullMQ queue
 * @param config - Advanced configuration
 */
export function setupQueueListeners(
  queue: Queue,
  config: AdvancedQueueConfig = DEFAULT_CONFIG
): void {
  // Job completed
  queue.on("completed", async (job) => {
    recordMetric(config, `${job.name}:completed`, 1);
    logger.debug({ jobId: job.id, jobName: job.name }, "Job completed");
  });

  // Job failed (with retry)
  queue.on("failed", async (job, error) => {
    const attempt = job.attemptsMade;
    const totalAttempts = job.opts.attempts || config.maxAttempts;
    const isLastAttempt = attempt >= (totalAttempts || 1);

    recordMetric(config, `${job.name}:failed`, 1);

    logger.warn(
      {
        jobId: job.id,
        jobName: job.name,
        attempt,
        totalAttempts,
        isLastAttempt,
        error: error.message,
      },
      "Job failed"
    );

    if (isLastAttempt && config.dlqEnabled) {
      await moveToDlq(queue, job, error, config);
    }
  });

  // Job stalled (lock timeout)
  queue.on("stalled", (job) => {
    recordMetric(config, `${job.name}:stalled`, 1);
    logger.error({ jobId: job.id, jobName: job.name }, "Job stalled (lock timed out)");
  });

  // Job waiting (ready to process)
  queue.on("waiting", (job) => {
    recordMetric(config, `${job.name}:waiting`, 1);
    logger.debug({ jobId: job.id, jobName: job.name }, "Job waiting");
  });

  // Queue error
  queue.on("error", (error) => {
    recordMetric(config, "queue:error", 1);
    logger.error({ error }, "Queue error");
  });

  logger.info({ queueName: queue.name }, "Queue listeners setup");
}

/**
 * Move a failed job to dead letter queue (DLQ).
 * Stores context for manual inspection/replay.
 *
 * @param queue - BullMQ queue
 * @param job - Failed job
 * @param error - Error that caused failure
 * @param config - Queue configuration
 */
export async function moveToDlq(
  queue: Queue,
  job: Job,
  error: Error,
  config: AdvancedQueueConfig
): Promise<void> {
  const dlqKey = `dlq:${queue.name}:${job.id}`;

  const dlqEntry = {
    jobId: job.id,
    jobName: job.name,
    data: job.data,
    error: error.message,
    stack: error.stack,
    attempts: job.attemptsMade,
    timestamp: new Date().toISOString(),
  };

  await redis.setex(
    dlqKey,
    Math.ceil(config.dlqRetentionMs / 1000),
    JSON.stringify(dlqEntry)
  );

  logger.error(
    { dlqKey, jobId: job.id, error: error.message },
    "Job moved to DLQ after permanent failure"
  );
}

/**
 * Retrieve dead letter queue entries for monitoring/replay.
 *
 * @param queueName - Queue name
 * @param limit - Max entries to retrieve
 * @returns Array of DLQ entries
 */
export async function retrieveDlq(queueName: string, limit: number = 100): Promise<unknown[]> {
  const pattern = `dlq:${queueName}:*`;
  const keys = await redis.keys(pattern);
  const entries = [];

  for (const key of keys.slice(0, limit)) {
    const data = await redis.get(key);
    if (data) {
      entries.push(JSON.parse(data));
    }
  }

  return entries;
}

/**
 * Record job metrics for monitoring/alerting.
 */
function recordMetric(config: AdvancedQueueConfig, key: string, value: number): void {
  if (!config.enableMetrics) return;

  const metricsKey = `${config.metricsPrefix}${key}`;
  // In production, emit to a metrics service (Prometheus, DataDog, etc.)
  // For now, just log
  logger.debug({ metric: metricsKey, value }, "Metric recorded");
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═════════════════════════════════════════════════════════════════════════
 *
 * // in jobs/index.ts:
 *
 * import {
 *   createQueueWithConfig,
 *   PRESETS,
 *   getOrCreateIdempotencyKey,
 *   createJobOptions,
 * } from "./queue-config.js";
 *
 * // Create queue with critical configuration
 * const siiSubmissionQueue = createQueueWithConfig(
 *   "sii-submissions",
 *   PRESETS.CRITICAL
 * );
 *
 * // Enqueue a job with idempotency
 * async function enqueueSiiSubmission(invoiceId: string, data: any) {
 *   const idempotencyKey = await getOrCreateIdempotencyKey(
 *     "sii",
 *     invoiceId,
 *     PRESETS.CRITICAL
 *   );
 *
 *   const jobOptions = createJobOptions(PRESETS.CRITICAL, {
 *     jobId: idempotencyKey, // Use as job ID for deduplication
 *   });
 *
 *   const job = await siiSubmissionQueue.add(
 *     "submit",
 *     { ...data, idempotencyKey },
 *     jobOptions
 *   );
 *
 *   return job;
 * }
 *
 * // Process jobs
 * siiSubmissionQueue.process(1, async (job) => {
 *   // Your job handler
 *   return processSubmission(job.data);
 * });
 */

/**
 * Graceful shutdown: drain queue and listeners.
 *
 * @param queue - BullMQ queue to shutdown
 */
export async function gracefulQueueShutdown(queue: Queue): Promise<void> {
  logger.info({ queueName: queue.name }, "Shutting down queue gracefully");
  await queue.close();
  logger.info({ queueName: queue.name }, "Queue shutdown complete");
}
