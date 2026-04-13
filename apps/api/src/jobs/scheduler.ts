import { db } from "../config/database.js";
import { logger } from "../shared/logger.js";
import { collectionQueue } from "./queue.js";

/**
 * Programa los jobs de cobranza para todas las facturas vencidas.
 * Este método se ejecuta diariamente (vía BullMQ repeatable job)
 * a las 8:00 AM hora de Chile.
 *
 * Lógica:
 * 1. Busca facturas OVERDUE cuyos tenants tienen cobranza habilitada
 * 2. Calcula días de vencimiento
 * 3. Si el día coincide con collectionDays del tenant, encola el job
 * 4. Email siempre; WhatsApp solo si ≥ 7 días vencida
 */
export async function scheduleOverdueCollections(): Promise<void> {
  const now = new Date();

  const overdueInvoices = await db.invoice.findMany({
    where: {
      status: "OVERDUE",
      tenant: {
        collectionEnabled: true,
      },
    },
    include: {
      tenant: {
        select: {
          id: true,
          collectionDays: true,
          collectionEnabled: true,
        },
      },
      client: {
        select: {
          email: true,
          phone: true,
        },
      },
    },
  });

  let scheduled = 0;

  for (const invoice of overdueInvoices) {
    const daysOverdue = Math.floor(
      (now.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Verificar si hoy es uno de los días de cobranza configurados
    const shouldSendToday = invoice.tenant.collectionDays.includes(daysOverdue);
    if (!shouldSendToday) continue;

    // Encolar email si tiene email
    if (invoice.client.email) {
      await collectionQueue.add(
        `collection-email-${invoice.id}-day${daysOverdue}`,
        {
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          daysOverdue,
          channel: "EMAIL",
        },
        { delay: Math.random() * 60000 }, // Dispersar en 1 minuto
      );
      scheduled++;
    }

    // Encolar WhatsApp si tiene teléfono y ≥ 7 días vencida
    if (invoice.client.phone && daysOverdue >= 7) {
      await collectionQueue.add(
        `collection-wa-${invoice.id}-day${daysOverdue}`,
        {
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          daysOverdue,
          channel: "WHATSAPP",
        },
        { delay: 30000 + Math.random() * 60000 },
      );
      scheduled++;
    }
  }

  logger.info(
    { overdueInvoices: overdueInvoices.length, scheduled },
    "Jobs de cobranza programados",
  );
}

/**
 * Actualiza el estado de facturas vencidas.
 * Convierte ISSUED → OVERDUE si la fecha de vencimiento ya pasó.
 */
export async function markOverdueInvoices(): Promise<number> {
  const now = new Date();

  const result = await db.invoice.updateMany({
    where: {
      status: "ISSUED",
      dueDate: { lt: now },
    },
    data: {
      status: "OVERDUE",
    },
  });

  if (result.count > 0) {
    logger.info({ count: result.count }, "Facturas marcadas como vencidas");
  }

  return result.count;
}
