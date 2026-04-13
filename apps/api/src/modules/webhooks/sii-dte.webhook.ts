/**
 * apps/api/src/modules/webhooks/sii-dte.webhook.ts
 *
 * Webhook handler for receiving incoming DTEs (purchase receipts) from SII intermediary.
 * 
 * Implements:
 * - HMAC-SHA256 signature verification
 * - Tenant routing based on DTE recipient RUT
 * - Cash flow entry creation for accounting
 * - Duplicate detection (idempotency)
 * - Error handling and recovery
 *
 * Endpoint: POST /api/v1/webhooks/sii/dte-received
 *
 * Usage:
 *   // In routes setup:
 *   app.post("/webhooks/sii/dte-received", {
 *     onRequest: [verifyWebhookSignature],
 *   }, handleSiiDteWebhook);
 */

import crypto from "crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../../config/database.js";
import { logger } from "../../shared/logger.js";
import { redis } from "../../config/redis.js";

/**
 * Webhook payload from SII intermediary.
 * Example: Proveedor sends us their DTE (invoice/receipt).
 */
export interface SiiDteWebhookPayload {
  // DTE metadata
  documentType: "FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO" | "BOLETA";
  folio: number;
  emissionDate: string; // ISO 8601: 2025-04-13

  // Issuer (seller/supplier)
  issuerRut: string; // Format: "12345678-9"
  issuerName: string;
  issuerEmail?: string;

  // Recipient (buyer/us)
  recipientRut: string; // Our company's RUT
  recipientEmail?: string;

  // Financial details
  netAmount: number; // Monto neto (ex. IVA) in CLP
  tax: number; // IVA (19%) in CLP
  totalAmount: number; // Monto total (inc. IVA) in CLP

  // DTE actual content
  dteXml: string; // Full XML, base64-encoded
  signature: string; // Digital signature (base64)

  // Metadata
  referenceNumber?: string; // Our PO number or reference
  notes?: string;

  // Webhook metadata
  timestamp: number; // Unix timestamp when SII sent this
  idempotencyKey: string; // Unique key per submission (prevents duplicates)
}

/**
 * Webhook secret (shared between SII intermediary and us).
 * In production: Load from environment variable with proper rotation.
 * 
 * ⚠️ SECURITY: Store in environment variable like WEBHOOK_SECRET_SII_DTE
 */
function getWebhookSecret(): string {
  const secret = process.env.WEBHOOK_SECRET_SII_DTE;
  if (!secret) {
    throw new Error("WEBHOOK_SECRET_SII_DTE environment variable not set");
  }
  return secret;
}

/**
 * Verify HMAC-SHA256 signature of webhook payload.
 * 
 * Signature is computed as:
 *   HMAC-SHA256(secret, json_body) -> hex
 * 
 * Header: X-SII-Signature: sha256=<hex>
 *
 * @param request - Fastify request
 * @throws Error if signature invalid
 */
export function verifyWebhookSignature(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: (error?: Error) => void
): void {
  try {
    const signatureHeader = request.headers["x-sii-signature"] as string;

    if (!signatureHeader) {
      return done(new Error("Missing X-SII-Signature header"));
    }

    // Extract algorithm and hash: "sha256=<hex>"
    const [algorithm, providedHash] = signatureHeader.split("=");

    if (algorithm !== "sha256" || !providedHash) {
      return done(new Error("Invalid signature format"));
    }

    // Compute expected signature
    const secret = getWebhookSecret();
    const body = JSON.stringify(request.body);
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(body);
    const expectedHash = hmac.digest("hex");

    // Timing-safe comparison
    if (!crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(expectedHash))) {
      logger.warn(
        { providedHash: providedHash.slice(0, 8), expectedHash: expectedHash.slice(0, 8) },
        "Webhook signature mismatch"
      );
      return done(new Error("Signature verification failed"));
    }

    logger.debug("Webhook signature verified");
    done();
  } catch (error) {
    done(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Extract tenant ID from DTE recipient RUT.
 * Looks up which tenant this RUT belongs to.
 *
 * @param recipientRut - Format: "12345678-9"
 * @returns Tenant ID
 * @throws Error if tenant not found
 */
async function resolveTenantByRut(recipientRut: string): Promise<string> {
  // Normalize RUT: remove dashes, no spaces
  const normalizedRut = recipientRut.replace(/[.\s-]/g, "");

  // Look up tenant by RUT
  const tenant = await db.tenant.findFirst({
    where: { rut: normalizedRut },
    select: { id: true },
  });

  if (!tenant) {
    logger.warn({ recipientRut }, "Tenant not found for DTE recipient RUT");
    throw new Error(`No tenant found for RUT ${recipientRut}`);
  }

  return tenant.id;
}

/**
 * Check if we've already processed this DTE.
 * Uses idempotencyKey to prevent duplicate cash flow entries.
 *
 * @param idempotencyKey - Unique key from SII per submission
 * @returns true if already processed
 */
async function isDuplicate(idempotencyKey: string): Promise<boolean> {
  const key = `sii:webhook:processed:${idempotencyKey}`;
  const exists = await redis.exists(key);
  return exists > 0;
}

/**
 * Mark DTE as processed (idempotency marker).
 * Expires after 24 hours.
 *
 * @param idempotencyKey - Unique key from SII
 */
async function markAsProcessed(idempotencyKey: string): Promise<void> {
  const key = `sii:webhook:processed:${idempotencyKey}`;
  await redis.setex(key, 24 * 60 * 60, "1"); // 24-hour retention
}

/**
 * Main webhook handler.
 * 
 * Flow:
 * 1. Verify signature
 * 2. Resolve tenant by recipient RUT
 * 3. Check idempotency
 * 4. Store DTE record
 * 5. Create cash flow entry
 * 6. Send notification to user
 * 7. Return 200 OK
 *
 * @param request - Fastify request with verified signature
 * @param reply - Fastify reply
 */
export async function handleSiiDteWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const payload = request.body as SiiDteWebhookPayload;

  try {
    logger.info(
      {
        documentType: payload.documentType,
        folio: payload.folio,
        issuer: payload.issuerRut,
        recipient: payload.recipientRut,
        amount: payload.totalAmount,
      },
      "Processing incoming DTE webhook"
    );

    // ─── 1. Resolve tenant ───
    const tenantId = await resolveTenantByRut(payload.recipientRut);

    // ─── 2. Check idempotency ───
    if (await isDuplicate(payload.idempotencyKey)) {
      logger.warn(
        { idempotencyKey: payload.idempotencyKey },
        "Duplicate DTE webhook ignored"
      );
      return reply.code(200).send({
        status: "IGNORED",
        reason: "Duplicate submission",
        idempotencyKey: payload.idempotencyKey,
      });
    }

    // ─── 3. Store DTE record ───
    const dteReceived = await db.dteReceived.create({
      data: {
        tenantId,
        documentType: payload.documentType,
        folio: payload.folio,
        emissionDate: new Date(payload.emissionDate),
        issuerRut: payload.issuerRut,
        issuerName: payload.issuerName,
        recipientRut: payload.recipientRut,
        netAmount: payload.netAmount,
        tax: payload.tax,
        totalAmount: payload.totalAmount,
        dteXmlBase64: payload.dteXml,
        signature: payload.signature,
        idempotencyKey: payload.idempotencyKey,
        rawMetadata: {
          referenceNumber: payload.referenceNumber,
          notes: payload.notes,
          issuedAt: new Date(payload.timestamp * 1000).toISOString(),
        },
        status: "RECEIVED",
      },
    });

    logger.info({ dteReceivedId: dteReceived.id }, "DTE record created");

    // ─── 4. Create cash flow entry ───
    // This represents an incoming (negative) cash outflow = expense/cost
    const cashflowEntry = await db.cashflowEntry.create({
      data: {
        tenantId,
        date: new Date(payload.emissionDate),
        type: "EXPENSE", // Purchase expense
        description: `DTE ${payload.documentType} #${payload.folio} de ${payload.issuerName}`,
        amount: payload.totalAmount,
        category: "PROVEEDORES", // Supplier payment
        relatedEntity: "DteReceived",
        relatedEntityId: dteReceived.id,
        metadata: {
          issuerRut: payload.issuerRut,
          issuerName: payload.issuerName,
          documentType: payload.documentType,
          folio: payload.folio,
        },
      },
    });

    logger.info(
      { cashflowEntryId: cashflowEntry.id, amount: payload.totalAmount },
      "Cash flow entry created"
    );

    // ─── 5. Find or create client/supplier ───
    let supplier = await db.client.findFirst({
      where: { tenantId, rut: payload.issuerRut },
    });

    if (!supplier) {
      supplier = await db.client.create({
        data: {
          tenantId,
          name: payload.issuerName,
          rut: payload.issuerRut,
          email: payload.issuerEmail || "",
          isSupplier: true,
          status: "ACTIVE",
        },
      });
      logger.info({ supplierId: supplier.id }, "New supplier created from DTE");
    }

    // ─── 6. Create notification ───
    await db.notificationLog.create({
      data: {
        tenantId,
        type: "DTE_RECEIVED",
        title: `${payload.documentType} recibida de ${payload.issuerName}`,
        message: `Se ha recibido ${payload.documentType} #${payload.folio} por $${payload.totalAmount.toLocaleString("es-CL")} de ${payload.issuerName}.`,
        actionUrl: `/dashboard/compras/${dteReceived.id}`, // Future: purchase tracking page
        read: false,
      },
    });

    // ─── 7. Mark as processed (idempotency) ───
    await markAsProcessed(payload.idempotencyKey);

    // ─── 8. Return success ───
    logger.info(
      {
        dteReceivedId: dteReceived.id,
        folio: payload.folio,
        amount: payload.totalAmount,
      },
      "DTE webhook processed successfully"
    );

    return reply.code(200).send({
      status: "ACCEPTED",
      dteReceivedId: dteReceived.id,
      cashflowEntryId: cashflowEntry.id,
      tenantId,
      idempotencyKey: payload.idempotencyKey,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        idempotencyKey: payload.idempotencyKey,
        error: errorMessage,
        folio: payload.folio,
      },
      "Failed to process DTE webhook"
    );

    // Return 400 for known errors (tenant not found, validation), 500 for unknowns
    const statusCode = errorMessage.includes("not found") ? 400 : 500;

    return reply.code(statusCode).send({
      status: "ERROR",
      error: errorMessage,
      idempotencyKey: payload.idempotencyKey,
    });
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * ROUTE REGISTRATION
 * ═════════════════════════════════════════════════════════════════════════
 *
 * In your routes file (e.g., webhooks.routes.ts):
 *
 * export async function registerWebhookRoutes(app: FastifyInstance) {
 *   app.post(
 *     "/webhooks/sii/dte-received",
 *     {
 *       onRequest: [verifyWebhookSignature],
 *       schema: {
 *         body: {
 *           type: "object",
 *           required: ["documentType", "folio", "recipientRut", "dteXml"],
 *           properties: {
 *             documentType: { type: "string", enum: ["FACTURA", "NOTA_CREDITO", "BOLETA"] },
 *             folio: { type: "number" },
 *             emissionDate: { type: "string", format: "date" },
 *             issuerRut: { type: "string" },
 *             issuerName: { type: "string" },
 *             recipientRut: { type: "string" },
 *             netAmount: { type: "number" },
 *             tax: { type: "number" },
 *             totalAmount: { type: "number" },
 *             dteXml: { type: "string" },
 *             signature: { type: "string" },
 *             idempotencyKey: { type: "string" },
 *             timestamp: { type: "number" },
 *           },
 *         },
 *       },
 *     },
 *     handleSiiDteWebhook
 *   );
 * }
 */

/**
 * ═════════════════════════════════════════════════════════════════════════
 * TESTING: Mock DTE webhook for local development
 * ═════════════════════════════════════════════════════════════════════════
 */

export function createMockDtePayload(overrides?: Partial<SiiDteWebhookPayload>): SiiDteWebhookPayload {
  const defaults: SiiDteWebhookPayload = {
    documentType: "FACTURA",
    folio: Math.floor(Math.random() * 100000),
    emissionDate: new Date().toISOString().split("T")[0],
    issuerRut: "76123456-5", // Dummy supplier RUT
    issuerName: "Proveedor SpA",
    recipientRut: "76389130-2", // Demo tenant RUT
    netAmount: 1000000,
    tax: 190000,
    totalAmount: 1190000,
    dteXml: Buffer.from("<DTE>example</DTE>").toString("base64"),
    signature: "mock-signature",
    idempotencyKey: `test-${Date.now()}`,
    timestamp: Math.floor(Date.now() / 1000),
  };

  return { ...defaults, ...overrides };
}

/**
 * Compute mock signature for testing.
 * In production, SII intermediary provides this.
 *
 * @param payload - Webhook payload
 * @param secret - Webhook secret (from env or test)
 * @returns X-SII-Signature header value
 */
export function computeMockSignature(
  payload: SiiDteWebhookPayload,
  secret: string
): string {
  const body = JSON.stringify(payload);
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  const hash = hmac.digest("hex");
  return `sha256=${hash}`;
}
