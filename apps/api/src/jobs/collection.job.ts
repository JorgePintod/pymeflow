import { Worker, type Job } from "bullmq";
import { redis } from "../config/redis.js";
import { db } from "../config/database.js";
import { EmailService } from "../modules/notifications/email.service.js";
import { WhatsappService } from "../modules/notifications/whatsapp.service.js";
import { PushService } from "../modules/notifications/push.service.js";
import { logger } from "../shared/logger.js";
import { COLLECTION_QUEUE, type CollectionJobData } from "./queue.js";

const emailService = new EmailService();
const whatsappService = new WhatsappService();
const pushService = new PushService();

/**
 * Worker que procesa los jobs de cobranza.
 * Cada job envía un recordatorio por EMAIL o WHATSAPP al cliente
 * y registra el resultado en collection_logs.
 */
export const collectionWorker = new Worker<CollectionJobData>(
  COLLECTION_QUEUE,
  async (job: Job<CollectionJobData>) => {
    const { tenantId, invoiceId, daysOverdue, channel } = job.data;
    logger.info({ invoiceId, daysOverdue, channel }, "Procesando job de cobranza");

    // Verificar que la factura sigue vencida
    const invoice = await db.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId,
        status: "OVERDUE",
      },
      include: {
        client: true,
        tenant: true,
        items: true,
      },
    });

    if (!invoice) {
      logger.info({ invoiceId }, "Factura ya no está vencida, omitiendo cobranza");
      return { skipped: true, reason: "invoice_not_overdue" };
    }

    // Calcular paidAmount sumando los pagos registrados
    const payments = await db.payment.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });
    const paidAmount = payments._sum.amount ?? 0;

    let result: { success: boolean; body: string; externalId?: string; error?: string };

    if (channel === "EMAIL" && invoice.client.email) {
      result = await emailService.sendCollectionEmail({
        invoice: { ...invoice, paidAmount },
        client: { email: invoice.client.email, businessName: invoice.client.businessName },
        tenant: invoice.tenant,
        daysOverdue,
      });
    } else if (channel === "WHATSAPP" && invoice.client.phone) {
      result = await whatsappService.sendCollectionMessage({
        invoice: { ...invoice, paidAmount },
        client: { phone: invoice.client.phone, businessName: invoice.client.businessName },
        daysOverdue,
      });
    } else {
      logger.warn(
        { invoiceId, channel },
        "No hay contacto disponible para este canal de cobranza",
      );
      return { skipped: true, reason: "no_contact" };
    }

    // Registrar el log de cobranza
    await db.collectionLog.create({
      data: {
        invoiceId,
        tenantId,
        channel,
        status: result.success ? "SENT" : "FAILED",
        messageBody: result.body,
        externalId: result.externalId,
        errorMessage: result.error,
      },
    });

    // Actualizar contador de cobranzas en la factura
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        lastCollectionAt: new Date(),
        collectionCount: { increment: 1 },
      },
    });

    // Enviar push notification al dueño del tenant
    const folio = String(invoice.folio ?? invoice.internalRef ?? invoice.id.slice(0, 8));
    await pushService.notifyOverdueInvoice(
      tenantId,
      invoiceId,
      folio,
      invoice.client.businessName,
      invoice.totalAmount - paidAmount,
      daysOverdue,
    );

    return { success: result.success, channel };
  },
  { connection: redis, concurrency: 5 },
);

// Log de eventos del worker
collectionWorker.on("completed", (job) => {
  logger.info({ jobId: job.id, data: job.returnvalue }, "Job de cobranza completado");
});

collectionWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "Job de cobranza fallido");
});
