import type { FastifyInstance } from "fastify";
import { InvoicesService } from "./invoices.service.js";
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesQuerySchema,
  registerPaymentSchema,
} from "./invoices.schema.js";
import { authenticate, authorize } from "../auth/auth.middleware.js";
import { ValidationError } from "../../shared/errors.js";
import { generateInvoicePdf } from "./invoices.pdf.js";
import { db } from "../../config/database.js";
import { checkPlanLimit } from "../../shared/plan-limits.js";

const invoicesService = new InvoicesService();

/**
 * Rutas del módulo de facturas.
 * Prefijo: /api/v1/invoices
 *
 * GET    /               — Listar facturas
 * GET    /:id            — Obtener factura por ID
 * POST   /               — Crear factura (borrador)
 * PATCH  /:id            — Actualizar factura borrador
 * POST   /:id/issue      — Emitir factura
 * POST   /:id/cancel     — Cancelar factura
 * POST   /:id/payments   — Registrar pago
 */
export async function invoicesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // GET / — Listar facturas con filtros y paginación
  app.get("/", async (request, reply) => {
    const parsed = listInvoicesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError("Parámetros de consulta inválidos", {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await invoicesService.findAll(
      request.user.tenantId,
      parsed.data,
    );
    return reply.send({ success: true, ...result });
  });

  // GET /:id — Obtener factura con ítems, cliente y pagos
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const invoice = await invoicesService.findById(
      request.user.tenantId,
      request.params.id,
    );
    return reply.send({ success: true, data: invoice });
  });

  // POST / — Crear factura borrador
  app.post(
    "/",
    { preHandler: [authorize("OWNER", "ADMIN", "OPERATOR"), checkPlanLimit] },
    async (request, reply) => {
      const parsed = createInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Datos de factura inválidos", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const invoice = await invoicesService.create(
        request.user.tenantId,
        parsed.data,
      );
      return reply.status(201).send({ success: true, data: invoice });
    },
  );

  // PATCH /:id — Actualizar factura en borrador
  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authorize("OWNER", "ADMIN", "OPERATOR")] },
    async (request, reply) => {
      const parsed = updateInvoiceSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Datos de actualización inválidos", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const invoice = await invoicesService.update(
        request.user.tenantId,
        request.params.id,
        parsed.data,
      );
      return reply.send({ success: true, data: invoice });
    },
  );

  // POST /:id/issue — Emitir factura (DRAFT → ISSUED)
  app.post<{ Params: { id: string } }>(
    "/:id/issue",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      const invoice = await invoicesService.issue(
        request.user.tenantId,
        request.params.id,
      );
      return reply.send({ success: true, data: invoice });
    },
  );

  // POST /:id/cancel — Cancelar factura
  app.post<{ Params: { id: string } }>(
    "/:id/cancel",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      const invoice = await invoicesService.cancel(
        request.user.tenantId,
        request.params.id,
      );
      return reply.send({ success: true, data: invoice });
    },
  );

  // POST /:id/payments — Registrar pago en una factura
  app.post<{ Params: { id: string } }>(
    "/:id/payments",
    { preHandler: [authorize("OWNER", "ADMIN", "OPERATOR")] },
    async (request, reply) => {
      const parsed = registerPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Datos de pago inválidos", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await invoicesService.registerPayment(
        request.user.tenantId,
        request.params.id,
        parsed.data,
      );
      return reply.status(201).send({ success: true, data: result });
    },
  );

  // GET /:id/pdf — Descargar PDF de la factura
  app.get<{ Params: { id: string } }>("/:id/pdf", async (request, reply) => {
    const invoice = await invoicesService.findById(
      request.user.tenantId,
      request.params.id,
    );

    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: request.user.tenantId },
      select: {
        businessName: true,
        rut: true,
        address: true,
        commune: true,
        region: true,
        economicActivity: true,
      },
    });

    const pdfBuffer = await generateInvoicePdf({
      tenant,
      client: invoice.client,
      invoice: {
        documentType: invoice.documentType,
        folio: invoice.folio,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        netAmount: invoice.netAmount,
        ivaRate: invoice.ivaRate,
        ivaAmount: invoice.ivaAmount,
        totalAmount: invoice.totalAmount,
        notes: invoice.notes,
        items: invoice.items,
      },
    });

    const filename = invoice.folio
      ? `factura-${invoice.folio}.pdf`
      : `borrador-${invoice.id.slice(-8)}.pdf`;

    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(pdfBuffer);
  });
}
