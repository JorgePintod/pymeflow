import Redis from "ioredis";
import { env } from "./env.js";

/**
 * Instancia singleton de Redis.
 * Usada para BullMQ queues y cache de tokens SII.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Requerido por BullMQ
  enableReadyCheck: false,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on("error", (err) => {
  console.error("❌ Error de conexión Redis:", err.message);
});

redis.on("connect", () => {
  if (env.NODE_ENV === "development") {
    console.log("✅ Redis conectado");
  }
});
