import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

declare global {
  // Evita múltiples instancias en hot-reload de desarrollo
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Instancia singleton de Prisma Client.
 * En desarrollo, reutiliza la instancia entre recargas para no agotar conexiones.
 */
export const db: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    errorFormat: "pretty",
  });

if (env.NODE_ENV !== "production") {
  global.__prisma = db;
}
