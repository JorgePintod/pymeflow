import { Queue } from "bullmq";
import { redis } from "../config/redis.js";
import { logger } from "../shared/logger.js";
import { scheduleOverdueCollections, markOverdueInvoices } from "./scheduler.js";

// Importar el worker para que se registre
import "./collection.job.js";

const SCHEDULER_QUEUE = "scheduler";

/**
 * Inicializa las colas de jobs y programa el cron diario.
 * Se llama una vez al arrancar el servidor.
 *
 * Usa BullMQ repeatable jobs para el cron:
 * - Cada día a las 08:00 AM: marca vencidas + programa cobranzas
 */
export async function initJobs(): Promise<void> {
  const schedulerQueue = new Queue(SCHEDULER_QUEUE, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  });

  // Limpiar repeatables anteriores y programar uno nuevo
  const existingRepeatables = await schedulerQueue.getRepeatableJobs();
  for (const job of existingRepeatables) {
    await schedulerQueue.removeRepeatableByKey(job.key);
  }

  // Cron diario a las 8:00 AM (hora de Chile / UTC-4)
  await schedulerQueue.add(
    "daily-collection-check",
    {},
    {
      repeat: { pattern: "0 8 * * *" },
    },
  );

  // Worker del scheduler
  const { Worker } = await import("bullmq");
  new Worker(
    SCHEDULER_QUEUE,
    async () => {
      logger.info("Ejecutando cron diario de cobranza");
      await markOverdueInvoices();
      await scheduleOverdueCollections();
    },
    { connection: redis, concurrency: 1 },
  );

  logger.info("Jobs de cobranza inicializados (cron diario 08:00 AM)");
}
