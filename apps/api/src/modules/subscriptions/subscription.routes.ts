import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, authorize } from "../auth/auth.middleware.js";
import { SubscriptionService } from "./subscription.service.js";

const subscriptionService = new SubscriptionService();

const PLANS = ["STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;

/**
 * Rutas de suscripción y facturación SaaS.
 * Integra checkout de Stripe, portal de cliente y webhooks.
 */
export async function subscriptionRoutes(app: FastifyInstance): Promise<void> {
  // ─── Webhook de Stripe (sin autenticación, usa firma) ────
  app.post("/webhook", {
    config: { rawBody: true },
  }, async (request, reply) => {
    const signature = request.headers["stripe-signature"] as string;

    if (!signature) {
      return reply.status(400).send({ success: false, message: "Falta la firma de Stripe" });
    }

    // Fastify raw body — necesita @fastify/raw-body o Buffer del body
    const rawBody = (request as any).rawBody as Buffer ?? Buffer.from(JSON.stringify(request.body));

    await subscriptionService.handleWebhook(rawBody, signature);
    return { received: true };
  });

  // ─── Rutas protegidas ────────────────────────────────────
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", authenticate);

    // Obtener info de suscripción actual
    protectedApp.get("/", async (request) => {
      const info = await subscriptionService.getSubscription(request.user.tenantId);
      return { success: true, data: info };
    });

    // Crear sesión de checkout (solo OWNER)
    protectedApp.post("/checkout", {
      preHandler: [authenticate, authorize("OWNER")],
    }, async (request) => {
      const { plan } = z.object({ plan: z.enum(PLANS) }).parse(request.body);
      const result = await subscriptionService.createCheckoutSession(
        request.user.tenantId,
        plan,
      );
      return { success: true, data: result };
    });

    // Crear sesión de portal (solo OWNER)
    protectedApp.post("/portal", {
      preHandler: [authenticate, authorize("OWNER")],
    }, async (request) => {
      const result = await subscriptionService.createPortalSession(request.user.tenantId);
      return { success: true, data: result };
    });
  });
}
