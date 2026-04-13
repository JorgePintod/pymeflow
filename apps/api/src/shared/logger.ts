import pino from "pino";
import { env } from "../config/env.js";

/**
 * Logger centralizado de la aplicación.
 * Usa Pino para performance en producción y pino-pretty en desarrollo.
 */
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  // En producción, serialización JSON directa (mejor para Axiom/Sentry)
  ...(env.NODE_ENV === "production" && {
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  }),
});
