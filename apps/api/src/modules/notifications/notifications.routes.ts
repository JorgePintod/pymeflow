import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.middleware.js";
import { PushService } from "./push.service.js";
import { db } from "../../config/database.js";
import { ValidationError } from "../../shared/errors.js";
import { buildPagination } from "../../shared/pagination.js";

const pushService = new PushService();

const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

const listNotificationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

/**
 * Rutas del módulo de notificaciones.
 * Prefijo: /api/v1/notifications
 *
 * POST   /push/subscribe    — Registrar suscripción push
 * DELETE /push/subscribe     — Cancelar suscripción push
 * GET    /                   — Listar notificaciones del tenant
 * PATCH  /:id/read           — Marcar notificación como leída
 * POST   /read-all           — Marcar todas como leídas
 */
export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  /**
   * POST /push/subscribe
   * Registra una suscripción de Web Push Notification.
   */
  app.post("/push/subscribe", async (request, reply) => {
    const parsed = pushSubscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Datos de suscripción inválidos", {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    await pushService.subscribe(
      request.user.tenantId,
      request.user.sub,
      parsed.data.subscription,
      request.headers["user-agent"],
    );

    return reply.status(201).send({ success: true });
  });

  /**
   * DELETE /push/subscribe
   * Cancela la suscripción push del endpoint proporcionado.
   */
  app.delete("/push/subscribe", async (request, reply) => {
    const body = request.body as { endpoint?: string };
    if (!body?.endpoint) {
      throw new ValidationError("Se requiere el endpoint de la suscripción");
    }

    await pushService.unsubscribe(body.endpoint);
    return reply.send({ success: true });
  });

  /**
   * GET /
   * Lista notificaciones del tenant con paginación.
   */
  app.get("/", async (request, reply) => {
    const parsed = listNotificationsSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError("Parámetros inválidos", {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { page, limit, unreadOnly } = parsed.data;

    const where = {
      tenantId: request.user.tenantId,
      ...(unreadOnly && { isRead: false }),
    };

    const [notifications, total] = await Promise.all([
      db.notificationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.notificationLog.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: notifications,
      pagination: buildPagination({ page, limit }, total).pagination,
    });
  });

  /**
   * PATCH /:id/read
   * Marca una notificación como leída.
   */
  app.patch<{ Params: { id: string } }>("/:id/read", async (request, reply) => {
    await db.notificationLog.updateMany({
      where: {
        id: request.params.id,
        tenantId: request.user.tenantId,
      },
      data: { isRead: true },
    });

    return reply.send({ success: true });
  });

  /**
   * POST /read-all
   * Marca todas las notificaciones como leídas.
   */
  app.post("/read-all", async (request, reply) => {
    await db.notificationLog.updateMany({
      where: {
        tenantId: request.user.tenantId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return reply.send({ success: true });
  });
}
