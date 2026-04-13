import Stripe from "stripe";
import { db } from "../../config/database.js";
import { env } from "../../config/env.js";
import { PLAN_PRICES_CLP } from "../../config/constants.js";
import { AppError, NotFoundError, ValidationError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import type { Plan, SubscriptionStatus } from "@prisma/client";

/**
 * Servicio de suscripciones con integración Stripe.
 * Maneja checkout, portal de cliente, cambio de plan y webhooks.
 */
export class SubscriptionService {
  private stripe: Stripe | null;

  constructor() {
    this.stripe = env.STRIPE_SECRET_KEY
      ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" })
      : null;
  }

  private getStripe(): Stripe {
    if (!this.stripe) {
      throw new AppError("Stripe no está configurado", 503, "STRIPE_NOT_CONFIGURED");
    }
    return this.stripe;
  }

  /**
   * Obtener info de suscripción actual del tenant
   */
  async getSubscription(tenantId: string) {
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        plan: true,
        planExpiresAt: true,
        stripeCustomerId: true,
      },
    });

    const subscription = await db.subscription.findFirst({
      where: { tenantId, status: { in: ["ACTIVE", "TRIALING"] } },
      orderBy: { createdAt: "desc" },
    });

    return {
      plan: tenant.plan,
      planExpiresAt: tenant.planExpiresAt,
      stripeCustomerId: tenant.stripeCustomerId,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
    };
  }

  /**
   * Crear sesión de checkout en Stripe para upgrade de plan
   */
  async createCheckoutSession(tenantId: string, plan: Plan) {
    const stripe = this.getStripe();

    if (plan === "FREE") {
      throw new ValidationError("No se puede comprar el plan gratuito");
    }

    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { users: { where: { role: "OWNER" }, take: 1 } },
    });

    // Crear o recuperar customer de Stripe
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: tenant.users[0]?.email ?? tenant.email ?? undefined,
        name: tenant.businessName,
        metadata: { tenantId },
      });
      customerId = customer.id;
      await db.tenant.update({
        where: { id: tenantId },
        data: { stripeCustomerId: customerId },
      });
    }

    // Buscar o crear un precio para este plan
    const priceId = await this.getOrCreatePrice(stripe, plan);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.FRONTEND_URL}/dashboard?subscription=success`,
      cancel_url: `${env.FRONTEND_URL}/dashboard?subscription=cancelled`,
      metadata: { tenantId, plan },
    });

    return { url: session.url };
  }

  /**
   * Crear sesión de portal de Stripe para gestión de suscripción
   */
  async createPortalSession(tenantId: string) {
    const stripe = this.getStripe();

    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    if (!tenant.stripeCustomerId) {
      throw new ValidationError("No tienes una suscripción activa");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${env.FRONTEND_URL}/dashboard`,
    });

    return { url: session.url };
  }

  /**
   * Procesar eventos webhook de Stripe.
   * Actualiza plan del tenant según el estado de la suscripción.
   */
  async handleWebhook(payload: Buffer, signature: string) {
    const stripe = this.getStripe();

    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError("Webhook secret no configurado", 503, "WEBHOOK_NOT_CONFIGURED");
    }

    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );

    logger.info({ type: event.type }, "Stripe webhook recibido");

    switch (event.type) {
      case "checkout.session.completed":
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        logger.debug({ type: event.type }, "Evento Stripe no manejado");
    }
  }

  // ─── Handlers de webhooks ──────────────────────────

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenantId;
    const plan = session.metadata?.plan as Plan | undefined;

    if (!tenantId || !plan) {
      logger.warn("Checkout completado sin metadata de tenant/plan");
      return;
    }

    const stripeSubscriptionId = session.subscription as string;

    // Crear registro de suscripción local
    await db.subscription.create({
      data: {
        tenantId,
        plan,
        status: "ACTIVE",
        stripeSubscriptionId,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Actualizar plan del tenant
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        plan,
        planExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    logger.info({ tenantId, plan }, "Tenant actualizado a nuevo plan");
  }

  private async handleSubscriptionUpdated(sub: Stripe.Subscription) {
    const subscription = await db.subscription.findUnique({
      where: { stripeSubscriptionId: sub.id },
    });

    if (!subscription) return;

    const statusMap: Record<string, SubscriptionStatus> = {
      active: "ACTIVE",
      past_due: "PAST_DUE",
      canceled: "CANCELLED",
      trialing: "TRIALING",
    };

    const newStatus = statusMap[sub.status] ?? "ACTIVE";

    // Stripe v22 dahlia: period dates may be on items
    const raw = sub as unknown as Record<string, unknown>;
    const periodStart = typeof raw.current_period_start === "number"
      ? new Date((raw.current_period_start as number) * 1000)
      : subscription.currentPeriodStart;
    const periodEnd = typeof raw.current_period_end === "number"
      ? new Date((raw.current_period_end as number) * 1000)
      : subscription.currentPeriodEnd;

    await db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: newStatus,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    });

    // Si está cancelada, downgrade a FREE al final del periodo
    if (newStatus === "CANCELLED") {
      await db.tenant.update({
        where: { id: subscription.tenantId },
        data: {
          planExpiresAt: periodEnd,
        },
      });
    }
  }

  private async handleSubscriptionDeleted(sub: Stripe.Subscription) {
    const subscription = await db.subscription.findFirst({
      where: { stripeSubscriptionId: sub.id },
    });

    if (!subscription) return;

    await db.subscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELLED" },
    });

    // Downgrade inmediato a FREE
    await db.tenant.update({
      where: { id: subscription.tenantId },
      data: { plan: "FREE", planExpiresAt: null },
    });

    logger.info({ tenantId: subscription.tenantId }, "Suscripción cancelada, downgrade a FREE");
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;

    const tenant = await db.tenant.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (!tenant) return;

    // Marcar suscripción como past_due
    await db.subscription.updateMany({
      where: { tenantId: tenant.id, status: "ACTIVE" },
      data: { status: "PAST_DUE" },
    });

    logger.warn({ tenantId: tenant.id }, "Pago fallido — suscripción en mora");
  }

  // ─── Helpers ───────────────────────────────────────

  /**
   * Obtener o crear precio en Stripe para un plan.
   * En producción se usarían Price IDs fijos.
   */
  private async getOrCreatePrice(stripe: Stripe, plan: Plan): Promise<string> {
    const amount = PLAN_PRICES_CLP[plan];

    // Buscar precio existente
    const prices = await stripe.prices.list({
      lookup_keys: [`pymeflow_${plan.toLowerCase()}_monthly`],
      active: true,
      limit: 1,
    });

    if (prices.data.length > 0) {
      return prices.data[0]!.id;
    }

    // Crear producto y precio
    const product = await stripe.products.create({
      name: `PymeFlow ${plan}`,
      metadata: { plan },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: amount,
      currency: "clp",
      recurring: { interval: "month" },
      lookup_key: `pymeflow_${plan.toLowerCase()}_monthly`,
    });

    return price.id;
  }
}
