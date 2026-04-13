import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, authorize } from "../auth/auth.middleware.js";
import { db } from "../../config/database.js";
import { ValidationError, NotFoundError } from "../../shared/errors.js";
import { buildPagination } from "../../shared/pagination.js";
import { scheduleOverdueCollections, markOverdueInvoices } from "../../jobs/scheduler.js";

const listCollectionLogsSchema = z.object({
  invoiceId: z.string().optional(),
  channel: z.enum(["EMAIL", "WHATSAPP", "SMS"]).optional(),
  status: z.enum(["SENT", "DELIVERED", "FAILED", "BOUNCED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const updateSettingsSchema = z.object({
  collectionEnabled: z.boolean().optional(),
  collectionDays: z.array(z.number().int().min(1).max(365)).min(1).max(10).optional(),
});

/**
 * Rutas del módulo de cobranza automática.
 * Prefijo: /api/v1/collections
 *
 * GET    /logs                — Listar logs de cobranza
 * GET    /logs/:invoiceId     — Logs de una factura específica
 * GET    /settings            — Obtener configuración de cobranza
 * PATCH  /settings            — Actualizar configuración
 * POST   /run                 — Ejecutar cobranza manualmente (admin)
 */
export async function collectionsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  /**
   * GET /logs
   * Lista logs de cobranza del tenant con filtros.
   */
  app.get("/logs", async (request, reply) => {
    const parsed = listCollectionLogsSchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError("Parámetros inválidos", {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { invoiceId, channel, status, page, limit } = parsed.data;

    const where = {
      tenantId: request.user.tenantId,
      ...(invoiceId && { invoiceId }),
      ...(channel && { channel }),
      ...(status && { status }),
    };

    const [logs, total] = await Promise.all([
      db.collectionLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          invoice: {
            select: {
              folio: true,
              internalRef: true,
              totalAmount: true,
              client: { select: { businessName: true, rut: true } },
            },
          },
        },
      }),
      db.collectionLog.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: logs,
      pagination: buildPagination({ page, limit }, total).pagination,
    });
  });

  /**
   * GET /settings
   * Obtiene la configuración de cobranza del tenant.
   */
  app.get("/settings", async (request, reply) => {
    const tenant = await db.tenant.findUnique({
      where: { id: request.user.tenantId },
      select: {
        collectionEnabled: true,
        collectionDays: true,
      },
    });

    if (!tenant) throw new NotFoundError("Tenant no encontrado");

    return reply.send({ success: true, data: tenant });
  });

  /**
   * PATCH /settings
   * Actualiza la configuración de cobranza del tenant.
   * Solo OWNER y ADMIN.
   */
  app.patch(
    "/settings",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      const parsed = updateSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Datos inválidos", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const updated = await db.tenant.update({
        where: { id: request.user.tenantId },
        data: parsed.data,
        select: {
          collectionEnabled: true,
          collectionDays: true,
        },
      });

      return reply.send({ success: true, data: updated });
    },
  );

  /**
   * POST /run
   * Ejecuta manualmente el proceso de cobranza (marca vencidas + programa jobs).
   * Solo OWNER y ADMIN.
   */
  app.post(
    "/run",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (_request, reply) => {
      const markedCount = await markOverdueInvoices();
      await scheduleOverdueCollections();

      return reply.send({
        success: true,
        data: { markedOverdue: markedCount },
      });
    },
  );
}
