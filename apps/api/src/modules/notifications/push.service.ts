import webPush from "web-push";
import { env } from "../../config/env.js";
import { db } from "../../config/database.js";
import { logger } from "../../shared/logger.js";

// Configurar VAPID si las claves están disponibles
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: Record<string, unknown>;
}

/**
 * Servicio de Web Push Notifications.
 * Gestiona suscripciones y envío de notificaciones push.
 */
export class PushService {
  /**
   * Registra o actualiza una suscripción push para un usuario.
   */
  async subscribe(
    tenantId: string,
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ): Promise<void> {
    await db.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        tenantId,
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent ?? null,
        isActive: true,
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        isActive: true,
      },
    });

    logger.info({ userId, endpoint: subscription.endpoint }, "Push subscription registrada");
  }

  /**
   * Elimina una suscripción push.
   */
  async unsubscribe(endpoint: string): Promise<void> {
    await db.pushSubscription.updateMany({
      where: { endpoint },
      data: { isActive: false },
    });
  }

  /**
   * Envía una notificación push a todos los dispositivos de un tenant.
   */
  async notifyTenant(tenantId: string, payload: PushPayload): Promise<number> {
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      logger.info({ tenantId, title: payload.title }, "Push notification simulada (sin VAPID)");
      return 0;
    }

    const subscriptions = await db.pushSubscription.findMany({
      where: { tenantId, isActive: true },
    });

    let sent = 0;

    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 410 Gone o 404 = suscripción inválida
        if (statusCode === 410 || statusCode === 404) {
          await db.pushSubscription.update({
            where: { id: sub.id },
            data: { isActive: false },
          });
          logger.info({ endpoint: sub.endpoint }, "Push subscription desactivada (gone)");
        } else {
          logger.error({ err, endpoint: sub.endpoint }, "Error al enviar push notification");
        }
      }
    }

    return sent;
  }

  /**
   * Envía notificación de factura vencida a un tenant.
   */
  async notifyOverdueInvoice(
    tenantId: string,
    invoiceId: string,
    folio: string,
    clientName: string,
    amount: number,
    daysOverdue: number,
  ): Promise<void> {
    await this.notifyTenant(tenantId, {
      title: "Factura vencida",
      body: `Factura ${folio} de ${clientName} — $${amount.toLocaleString("es-CL")} vencida hace ${daysOverdue} día${daysOverdue > 1 ? "s" : ""}`,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      url: `/dashboard/facturas/${invoiceId}`,
      data: { type: "invoice_overdue", invoiceId },
    });

    // Registrar en NotificationLog
    await db.notificationLog.create({
      data: {
        tenantId,
        type: "invoice_overdue",
        title: "Factura vencida",
        body: `Factura ${folio} de ${clientName} — $${amount.toLocaleString("es-CL")} (${daysOverdue}d)`,
        data: { invoiceId, daysOverdue },
      },
    });
  }
}
