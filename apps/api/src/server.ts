import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { db } from "./config/database.js";
import { logger } from "./shared/logger.js";
import { AppError } from "./shared/errors.js";

// Módulos de rutas
import { authRoutes } from "./modules/auth/auth.routes.js";
import { clientsRoutes } from "./modules/clients/clients.routes.js";
import { invoicesRoutes } from "./modules/invoices/invoices.routes.js";
import { cashflowRoutes } from "./modules/cashflow/cashflow.routes.js";
import { collectionsRoutes } from "./modules/collections/collections.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { notificationsRoutes } from "./modules/notifications/notifications.routes.js";
import { siiRoutes } from "./modules/sii/sii.routes.js";
import { expensesRoutes } from "./modules/expenses/expenses.routes.js";
import { subscriptionRoutes } from "./modules/subscriptions/subscription.routes.js";
import { initJobs } from "./jobs/index.js";

/**
 * Crea y configura la instancia de Fastify con todos los plugins y rutas.
 * Separado de main() para permitir testing con supertest.
 */
export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  // ─── Plugins de seguridad ────────────────────────────

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  // En desarrollo permitimos orígenes dinámicos (localhost:3000/3002),
  // en producción restringimos a la URL configurada.
  const corsOptions =
    env.NODE_ENV !== "production"
      ? { origin: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], credentials: true }
      : { origin: [env.FRONTEND_URL], methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], credentials: true };

  await app.register(cors, corsOptions);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Demasiadas solicitudes. Intenta en un momento.",
    }),
  });

  // ─── Health check ────────────────────────────────────

  app.get("/health", async () => {
    await db.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
    };
  });

  // ─── Registrar módulos con prefijo /api/v1 ──────────

  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(clientsRoutes, { prefix: "/api/v1/clients" });
  await app.register(invoicesRoutes, { prefix: "/api/v1/invoices" });
  await app.register(cashflowRoutes, { prefix: "/api/v1/cashflow" });
  await app.register(collectionsRoutes, { prefix: "/api/v1/collections" });
  await app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
  await app.register(notificationsRoutes, { prefix: "/api/v1/notifications" });
  await app.register(siiRoutes, { prefix: "/api/v1/sii" });
  await app.register(expensesRoutes, { prefix: "/api/v1/expenses" });
  await app.register(subscriptionRoutes, { prefix: "/api/v1/subscriptions" });

  // ─── Manejador global de errores ─────────────────────

  app.setErrorHandler((error, _request, reply) => {
    // Errores de la aplicación (controlados)
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.code,
        message: error.message,
        data: error.data,
      });
    }

    // Error de Prisma — conflicto de unicidad
    if ((error as unknown as Record<string, unknown>).code === "P2002") {
      return reply.status(409).send({
        success: false,
        error: "CONFLICT",
        message: "Ya existe un registro con estos datos",
      });
    }

    // Error de Zod (validación) que no fue atrapado en la ruta
    if (error.name === "ZodError") {
      return reply.status(400).send({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Datos de entrada inválidos",
      });
    }

    // Error de rate limit de Fastify
    if (error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: "RATE_LIMITED",
        message: "Demasiadas solicitudes. Intenta en un momento.",
      });
    }

    // Error no controlado — loguear y retornar genérico
    logger.error(error, "Error no controlado");
    return reply.status(500).send({
      success: false,
      error: "INTERNAL_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "Error interno del servidor"
          : error.message,
    });
  });

  return app;
}

/**
 * Entry point principal. Arranca el servidor HTTP.
 */
async function main() {
  const server = await buildApp();

  try {
    const address = await server.listen({
      port: env.PORT,
      host: "0.0.0.0",
    });

    logger.info(`🚀 PymeFlow API corriendo en ${address}`);
    logger.info(`📊 Ambiente: ${env.NODE_ENV}`);

    // Inicializar workers y cron de cobranza
    await initJobs();
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// ─── Graceful shutdown ───────────────────────────────

process.on("SIGINT", async () => {
  logger.info("Recibido SIGINT, cerrando conexiones...");
  await db.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Recibido SIGTERM, cerrando conexiones...");
  await db.$disconnect();
  process.exit(0);
});

main();
