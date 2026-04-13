/**
 * apps/api/src/modules/webhooks/webhooks.routes.ts
 *
 * Router registration for webhook endpoints.
 * Currently supports: SII DTE receipt webhook
 *
 * Usage:
 *   // In server.ts:
 *   import { registerWebhookRoutes } from "./modules/webhooks/webhooks.routes.js";
 *   await registerWebhookRoutes(app);
 */

import type { FastifyInstance } from "fastify";
import {
  handleSiiDteWebhook,
  verifyWebhookSignature,
} from "./sii-dte.webhook.js";

/**
 * Register all webhook routes.
 */
export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/webhooks/sii/dte-received
   *
   * Receive incoming DTE (invoice/receipt) from SII intermediary.
   * 
   * Authentication:
   *   - No JWT required (webhook from external system)
   *   - HMAC-SHA256 signature verification (via X-SII-Signature header)
   *   - Tenant identified by DTE recipient RUT
   *
   * Request body:
   *   {
   *     documentType: "FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO" | "BOLETA",
   *     folio: number,
   *     emissionDate: "2025-04-13",
   *     issuerRut: "12345678-9",
   *     issuerName: "Proveedor SpA",
   *     recipientRut: "76389130-2",
   *     netAmount: 1000000,
   *     tax: 190000,
   *     totalAmount: 1190000,
   *     dteXml: "base64-encoded-xml",
   *     signature: "digital-signature",
   *     idempotencyKey: "unique-key-per-submission",
   *     timestamp: 1713000000
   *   }
   *
   * Responses:
   *   200 OK:
   *     {
   *       status: "ACCEPTED",
   *       dteReceivedId: "...",
   *       cashflowEntryId: "...",
   *       tenantId: "...",
   *       idempotencyKey: "..."
   *     }
   *
   *   200 OK (duplicate):
   *     {
   *       status: "IGNORED",
   *       reason: "Duplicate submission",
   *       idempotencyKey: "..."
   *     }
   *
   *   400 Bad Request:
   *     {
   *       status: "ERROR",
   *       error: "No tenant found for RUT ...",
   *       idempotencyKey: "..."
   *     }
   *
   *   500 Internal Server Error:
   *     {
   *       status: "ERROR",
   *       error: "Database connection failed",
   *       idempotencyKey: "..."
   *     }
   */
  app.post(
    "/webhooks/sii/dte-received",
    {
      onRequest: [verifyWebhookSignature],
      schema: {
        summary: "Receive incoming DTE from SII",
        description: "Webhook endpoint for SII intermediary to send purchase DTEs",
        tags: ["Webhooks"],
        body: {
          type: "object",
          required: [
            "documentType",
            "folio",
            "emissionDate",
            "issuerRut",
            "issuerName",
            "recipientRut",
            "netAmount",
            "tax",
            "totalAmount",
            "dteXml",
            "signature",
            "idempotencyKey",
            "timestamp",
          ],
          properties: {
            documentType: {
              type: "string",
              enum: ["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO", "BOLETA"],
              description: "Type of DTE document",
            },
            folio: {
              type: "number",
              description: "Document folio number",
            },
            emissionDate: {
              type: "string",
              format: "date",
              description: "ISO 8601 date: YYYY-MM-DD",
            },
            issuerRut: {
              type: "string",
              description: "Supplier/issuer RUT (format: XX.XXX.XXX-X)",
            },
            issuerName: {
              type: "string",
              description: "Supplier/issuer business name",
            },
            recipientRut: {
              type: "string",
              description: "Our company RUT (identifies tenant)",
            },
            recipientEmail: {
              type: "string",
              format: "email",
              description: "Our email address",
            },
            netAmount: {
              type: "number",
              description: "Net amount (ex. IVA) in CLP",
            },
            tax: {
              type: "number",
              description: "IVA (19%) in CLP",
            },
            totalAmount: {
              type: "number",
              description: "Total amount (inc. IVA) in CLP",
            },
            dteXml: {
              type: "string",
              description: "Full DTE XML content (base64-encoded)",
            },
            signature: {
              type: "string",
              description: "Digital signature (base64-encoded)",
            },
            referenceNumber: {
              type: "string",
              description: "Optional reference (e.g., PO number)",
            },
            notes: {
              type: "string",
              description: "Optional notes",
            },
            idempotencyKey: {
              type: "string",
              description: "Unique key per submission (prevents duplicates)",
            },
            timestamp: {
              type: "number",
              description: "Unix timestamp when webhook was sent",
            },
          },
        },
        response: {
          200: {
            description: "DTE accepted or ignored",
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["ACCEPTED", "IGNORED", "ERROR"],
              },
              reason: { type: "string" },
              dteReceivedId: { type: "string" },
              cashflowEntryId: { type: "string" },
              tenantId: { type: "string" },
              idempotencyKey: { type: "string" },
              timestamp: { type: "string" },
              error: { type: "string" },
            },
          },
          400: {
            description: "Invalid request",
          },
          500: {
            description: "Server error",
          },
        },
      },
    },
    handleSiiDteWebhook
  );
}

/**
 * Health check endpoint (optional, useful for monitoring)
 *
 * GET /api/v1/webhooks/health
 *
 * Returns:
 *   200 OK: { status: "ok" }
 */
export async function registerWebhookHealthcheck(app: FastifyInstance): Promise<void> {
  app.get(
    "/webhooks/health",
    {
      schema: {
        summary: "Webhook system health check",
        response: {
          200: {
            type: "object",
            properties: { status: { type: "string" } },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send({ status: "ok" });
    }
  );
}
