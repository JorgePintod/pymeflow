import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, authorize } from "../auth/auth.middleware.js";
import { ValidationError } from "../../shared/errors.js";
import { SiiService } from "./sii.service.js";
import { CertificateService } from "./certificate.service.js";
import { CafService } from "./caf.service.js";

const siiService = new SiiService();
const certificateService = new CertificateService();
const cafService = new CafService();

const uploadCertificateSchema = z.object({
  p12Base64: z.string().min(100, "Certificado .p12 vacío o inválido"),
  password: z.string().min(1, "Contraseña requerida"),
});

const uploadCafSchema = z.object({
  cafXml: z.string().min(100, "Archivo CAF vacío o inválido"),
  environment: z.enum(["CERTIFICATION", "PRODUCTION"]).default("CERTIFICATION"),
});

const updateConfigSchema = z.object({
  siiEnvironment: z.enum(["CERTIFICATION", "PRODUCTION"]).optional(),
  siiResolution: z.string().optional(),
  siiResolutionDate: z.coerce.date().optional(),
  economicActivity: z.string().min(1).max(200).optional(),
  address: z.string().min(1).max(200).optional(),
  commune: z.string().min(1).max(100).optional(),
});

/**
 * Rutas del módulo SII.
 * Prefijo: /api/v1/sii
 *
 * Certificado:
 *   POST   /certificate          — Subir certificado digital .p12
 *   GET    /certificate          — Info del certificado actual
 *   DELETE /certificate          — Eliminar certificado
 *
 * CAF:
 *   POST   /caf                  — Subir archivo CAF
 *   GET    /caf                  — Listar rangos CAF
 *   DELETE /caf/:id              — Desactivar rango CAF
 *
 * DTE:
 *   POST   /invoices/:id/send    — Enviar factura al SII
 *   GET    /invoices/:id/status  — Consultar estado en SII
 *   GET    /invoices/:id/xml     — Descargar XML DTE firmado
 *
 * Config:
 *   GET    /config               — Configuración SII del tenant
 *   PATCH  /config               — Actualizar configuración SII
 */
export async function siiRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // ─── Certificado Digital ──────────────────────────

  app.post(
    "/certificate",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      const parsed = uploadCertificateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Datos inválidos", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const certInfo = await certificateService.uploadCertificate(
        request.user.tenantId,
        parsed.data.p12Base64,
        parsed.data.password,
      );

      return reply.status(201).send({ success: true, data: certInfo });
    },
  );

  app.get("/certificate", async (request, reply) => {
    const certInfo = await certificateService.getCertificateInfo(
      request.user.tenantId,
    );

    return reply.send({ success: true, data: certInfo });
  });

  app.delete(
    "/certificate",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      await certificateService.removeCertificate(request.user.tenantId);
      return reply.send({ success: true });
    },
  );

  // ─── CAF (Folios) ────────────────────────────────

  app.post(
    "/caf",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      const parsed = uploadCafSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Datos inválidos", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await cafService.uploadCaf(
        request.user.tenantId,
        parsed.data.cafXml,
        parsed.data.environment,
      );

      return reply.status(201).send({ success: true, data: result });
    },
  );

  app.get("/caf", async (request, reply) => {
    const ranges = await cafService.listCafRanges(request.user.tenantId);
    return reply.send({ success: true, data: ranges });
  });

  app.delete<{ Params: { id: string } }>(
    "/caf/:id",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      await cafService.deactivateCaf(request.user.tenantId, request.params.id);
      return reply.send({ success: true });
    },
  );

  // ─── Envío DTE al SII ────────────────────────────

  app.post<{ Params: { id: string } }>(
    "/invoices/:id/send",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      const result = await siiService.sendToSii(
        request.user.tenantId,
        request.params.id,
      );

      return reply.send({ success: true, data: result });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/invoices/:id/status",
    async (request, reply) => {
      const result = await siiService.queryInvoiceStatus(
        request.user.tenantId,
        request.params.id,
      );

      return reply.send({ success: true, data: result });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/invoices/:id/xml",
    async (request, reply) => {
      const invoice = await (await import("../../config/database.js")).db.invoice.findFirst({
        where: {
          id: request.params.id,
          tenantId: request.user.tenantId,
        },
        select: { xmlSii: true, folio: true, documentType: true },
      });

      if (!invoice) {
        throw new ValidationError("Factura no encontrada");
      }

      if (!invoice.xmlSii) {
        throw new ValidationError("Esta factura no tiene XML DTE generado");
      }

      return reply
        .header("Content-Type", "application/xml")
        .header(
          "Content-Disposition",
          `attachment; filename="DTE-${invoice.documentType}-${invoice.folio}.xml"`,
        )
        .send(invoice.xmlSii);
    },
  );

  // ─── Configuración SII ───────────────────────────

  app.get("/config", async (request, reply) => {
    const config = await siiService.getSiiConfig(request.user.tenantId);
    return reply.send({ success: true, data: config });
  });

  app.patch(
    "/config",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      const parsed = updateConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError("Datos inválidos", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const updated = await siiService.updateSiiConfig(
        request.user.tenantId,
        parsed.data,
      );

      return reply.send({ success: true, data: updated });
    },
  );
}
