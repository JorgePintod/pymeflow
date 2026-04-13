import { Queue } from "bullmq";
import { redis } from "../config/redis.js";

/**
 * Nombre de la cola de cobranza automática.
 */
export const COLLECTION_QUEUE = "collection";

/**
 * Datos de cada job de cobranza.
 */
export interface CollectionJobData {
  tenantId: string;
  invoiceId: string;
  daysOverdue: number;
  channel: "EMAIL" | "WHATSAPP";
}

/**
 * Queue de cobranza automática usando BullMQ.
 * Los jobs se crean cuando una factura cumple los días de cobranza configurados.
 */
export const collectionQueue = new Queue<CollectionJobData>(COLLECTION_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
