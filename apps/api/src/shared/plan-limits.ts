import type { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../config/database.js";
import { PLAN_LIMITS } from "../config/constants.js";
import { ForbiddenError } from "./errors.js";
import type { Plan } from "@prisma/client";

/**
 * Middleware que verifica el límite de DTE mensual según el plan del tenant.
 * Bloquea la emisión si se supera el cupo del plan.
 * Se aplica antes de crear/emitir facturas.
 */
export async function checkPlanLimit(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const { tenantId } = request.user;

  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { plan: true, planExpiresAt: true },
  });

  const plan: Plan = tenant.plan;
  const limit = PLAN_LIMITS[plan];

  // Plan sin límite
  if (limit === Infinity) return;

  // Verificar si el plan pagado expiró → tratar como FREE
  const effectiveLimit =
    plan !== "FREE" && tenant.planExpiresAt && tenant.planExpiresAt < new Date()
      ? PLAN_LIMITS.FREE
      : limit;

  // Contar DTE emitidos este mes
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const dteCount = await db.invoice.count({
    where: {
      tenantId,
      createdAt: { gte: startOfMonth },
    },
  });

  if (dteCount >= effectiveLimit) {
    throw new ForbiddenError(
      `Has alcanzado el límite de ${effectiveLimit} documentos/mes de tu plan ${plan}. Actualiza tu plan para emitir más.`,
    );
  }
}
