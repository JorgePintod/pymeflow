import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";

interface CollectionMessageParams {
  invoice: {
    id: string;
    folio: number | null;
    internalRef: string | null;
    totalAmount: number;
    paidAmount: number;
    dueDate: Date;
  };
  client: {
    phone: string;
    businessName: string;
  };
  daysOverdue: number;
}

interface WhatsAppResult {
  success: boolean;
  body: string;
  externalId?: string;
  error?: string;
}

/**
 * Servicio de WhatsApp usando Meta Cloud API.
 * En fase MVP, funciona como stub logueando las interacciones.
 * Para producción, se activa con META_ACCESS_TOKEN configurado.
 */
export class WhatsappService {
  private readonly apiUrl: string;
  private readonly phoneNumberId: string | undefined;
  private readonly accessToken: string | undefined;

  constructor() {
    this.apiUrl = env.META_WHATSAPP_API_URL;
    this.phoneNumberId = env.META_PHONE_NUMBER_ID;
    this.accessToken = env.META_ACCESS_TOKEN;
  }

  /**
   * Envía un mensaje de cobranza por WhatsApp.
   */
  async sendCollectionMessage(params: CollectionMessageParams): Promise<WhatsAppResult> {
    const { invoice, client, daysOverdue } = params;
    const remaining = invoice.totalAmount - invoice.paidAmount;
    const folio = invoice.folio ?? invoice.internalRef ?? invoice.id.slice(0, 8);

    const body = [
      `📋 *Recordatorio de pago*`,
      ``,
      `Estimado/a ${client.businessName},`,
      `La factura *N° ${folio}* tiene un saldo pendiente de *$${remaining.toLocaleString("es-CL")}* vencido hace ${daysOverdue} día${daysOverdue > 1 ? "s" : ""}.`,
      ``,
      `Le solicitamos regularizar el pago a la brevedad.`,
      `Si ya realizó el pago, ignore este mensaje.`,
      ``,
      `_Mensaje automático — PymeFlow_`,
    ].join("\n");

    // Sin credenciales de Meta, funcionar como stub
    if (!this.accessToken || !this.phoneNumberId) {
      logger.info(
        { phone: client.phone, invoiceId: invoice.id, daysOverdue },
        "WhatsApp de cobranza simulado (sin credenciales Meta)",
      );
      return { success: true, body, externalId: `wa-stub-${Date.now()}` };
    }

    try {
      const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: client.phone.replace(/[^0-9+]/g, ""),
          type: "text",
          text: { body },
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error(
          { status: response.status, errorData, invoiceId: invoice.id },
          "Error Meta WhatsApp API",
        );
        return { success: false, body, error: `HTTP ${response.status}: ${errorData}` };
      }

      const data = (await response.json()) as { messages?: Array<{ id: string }> };
      const externalId = data.messages?.[0]?.id;

      logger.info(
        { externalId, phone: client.phone, invoiceId: invoice.id },
        "WhatsApp de cobranza enviado",
      );

      return { success: true, body, externalId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      logger.error({ err, invoiceId: invoice.id }, "Excepción al enviar WhatsApp");
      return { success: false, body, error: message };
    }
  }
}
