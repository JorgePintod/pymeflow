import { Resend } from "resend";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";

const resend = new Resend(env.RESEND_API_KEY);

interface CollectionEmailParams {
  invoice: {
    id: string;
    folio: number | null;
    internalRef: string | null;
    totalAmount: number;
    paidAmount: number;
    dueDate: Date;
    items: Array<{ description: string }>;
  };
  client: {
    email: string;
    businessName: string;
  };
  tenant: {
    businessName: string;
    rut: string;
  };
  daysOverdue: number;
}

interface EmailResult {
  success: boolean;
  body: string;
  externalId?: string;
  error?: string;
}

/**
 * Servicio de emails transaccionales usando Resend.
 * Maneja todos los envíos de correo: cobranza, bienvenida, etc.
 */
export class EmailService {
  /**
   * Envía un email de cobranza por factura vencida.
   */
  async sendCollectionEmail(params: CollectionEmailParams): Promise<EmailResult> {
    const { invoice, client, tenant, daysOverdue } = params;
    const remaining = invoice.totalAmount - invoice.paidAmount;
    const folio = invoice.folio ?? invoice.internalRef ?? invoice.id.slice(0, 8);
    const dueDateStr = invoice.dueDate.toLocaleDateString("es-CL");

    const subject = `Recordatorio: Factura ${folio} vencida hace ${daysOverdue} día${daysOverdue > 1 ? "s" : ""}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #2563eb; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; font-size: 20px; margin: 0;">PymeFlow</h1>
        </div>
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Estimado/a <strong>${client.businessName}</strong>,
          </p>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Le informamos que la factura <strong>N° ${folio}</strong> emitida por
            <strong>${tenant.businessName}</strong> (RUT: ${tenant.rut})
            venció el <strong>${dueDateStr}</strong> y tiene un saldo pendiente de:
          </p>
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
            <p style="color: #991b1b; font-size: 24px; font-weight: bold; margin: 0;">
              $${remaining.toLocaleString("es-CL")}
            </p>
            <p style="color: #b91c1c; font-size: 13px; margin: 4px 0 0;">
              Vencida hace ${daysOverdue} día${daysOverdue > 1 ? "s" : ""}
            </p>
          </div>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Le solicitamos regularizar el pago a la brevedad. Si ya realizó el pago,
            por favor ignore este mensaje.
          </p>
          <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
            Mensaje enviado automáticamente por PymeFlow en nombre de ${tenant.businessName}.
          </p>
        </div>
        <div style="background: #f9fafb; padding: 16px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            PymeFlow — Facturación inteligente para PYMEs chilenas
          </p>
        </div>
      </div>
    `;

    const body = `Recordatorio: Factura ${folio} vencida hace ${daysOverdue} días. Monto pendiente: $${remaining.toLocaleString("es-CL")}`;

    // En desarrollo, solo logueamos
    if (env.RESEND_API_KEY === "re_dev_placeholder") {
      logger.info(
        { to: client.email, subject, invoiceId: invoice.id },
        "Email de cobranza simulado (dev mode)",
      );
      return { success: true, body, externalId: `dev-${Date.now()}` };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
        to: [client.email],
        subject,
        html,
      });

      if (error) {
        logger.error({ error, invoiceId: invoice.id }, "Error al enviar email de cobranza");
        return { success: false, body, error: error.message };
      }

      logger.info(
        { externalId: data?.id, invoiceId: invoice.id },
        "Email de cobranza enviado",
      );
      return { success: true, body, externalId: data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      logger.error({ err, invoiceId: invoice.id }, "Excepción al enviar email");
      return { success: false, body, error: message };
    }
  }

  /**
   * Envía un email de bienvenida al registrar un nuevo tenant.
   */
  async sendWelcomeEmail(to: string, name: string): Promise<EmailResult> {
    const subject = "¡Bienvenido a PymeFlow!";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #2563eb; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; font-size: 20px; margin: 0;">PymeFlow</h1>
        </div>
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #374151; font-size: 15px;">Hola <strong>${name}</strong>,</p>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Tu cuenta en PymeFlow ha sido creada exitosamente. Ya puedes empezar a
            emitir facturas electrónicas, gestionar clientes y automatizar tu cobranza.
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${env.FRONTEND_URL}/dashboard" style="background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Ir al Dashboard
            </a>
          </div>
        </div>
      </div>
    `;

    const body = `Bienvenido a PymeFlow, ${name}`;

    if (env.RESEND_API_KEY === "re_dev_placeholder") {
      logger.info({ to, subject }, "Email de bienvenida simulado (dev mode)");
      return { success: true, body, externalId: `dev-${Date.now()}` };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
        to: [to],
        subject,
        html,
      });

      if (error) {
        return { success: false, body, error: error.message };
      }
      return { success: true, body, externalId: data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      return { success: false, body, error: message };
    }
  }
}
