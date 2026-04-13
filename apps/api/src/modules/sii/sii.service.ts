import { db } from "../../config/database.js";
import { SII_DOCUMENT_TYPES } from "../../config/constants.js";
import { ValidationError, SiiError, NotFoundError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import { CertificateService } from "./certificate.service.js";
import { CafService } from "./caf.service.js";
import { DteBuilder, type DteData } from "./dte.builder.js";
import { DteSigningService } from "./dte.signing.js";
import { SiiApiClient } from "./sii.client.js";
import type { SiiEnvironment } from "@prisma/client";

interface SendDteResult {
  folio: number;
  trackId: string;
  siiStatus: string;
  xmlSii: string;
  environment: SiiEnvironment;
}

interface QueryStatusResult {
  siiStatus: string;
  rawStatus: string;
  glosa: string;
  numAtencion: string;
}

/**
 * Servicio principal de integración SII.
 * Orquesta el flujo completo: DRAFT → Folio CAF → Build XML → Firmar → Enviar → Tracking.
 */
export class SiiService {
  private certificateService = new CertificateService();
  private cafService = new CafService();
  private dteBuilder = new DteBuilder();
  private dteSigning = new DteSigningService();
  private siiClient = new SiiApiClient();

  /**
   * Envía una factura al SII.
   * Flujo completo: reservar folio → construir DTE → firmar → enviar.
   *
   * Requisitos previos:
   * - La factura debe estar en estado ISSUED (emitida)
   * - El tenant debe tener certificado digital cargado
   * - Debe haber folios CAF disponibles para el tipo de documento
   */
  async sendToSii(tenantId: string, invoiceId: string): Promise<SendDteResult> {
    // 1. Cargar factura con todos los datos necesarios
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        items: { orderBy: { lineNumber: "asc" } },
        client: true,
        tenant: true,
      },
    });

    if (!invoice) throw new NotFoundError("Factura");

    if (invoice.status !== "ISSUED") {
      throw new ValidationError(
        "Solo se pueden enviar al SII facturas en estado emitido (ISSUED). Emita la factura primero.",
      );
    }

    if (invoice.siiStatus === "ACCEPTED") {
      throw new ValidationError("Esta factura ya fue aceptada por el SII.");
    }

    const tenant = invoice.tenant;
    const environment = tenant.siiEnvironment;

    // 2. Obtener credenciales de firma
    const { privateKeyPem, certificatePem } =
      await this.certificateService.getSigningCredentials(tenantId);

    // 3. Reservar folio del CAF (si no tiene folio asignado desde issue())
    let folio = invoice.folio!;
    let cafPrivateKey: string | undefined;
    let cafXml: string | undefined;

    if (!folio) {
      const cafResult = await this.cafService.reserveFolio(
        tenantId,
        invoice.documentType,
        environment,
      );
      folio = cafResult.folio;
      cafPrivateKey = cafResult.privateKey;
      cafXml = cafResult.cafXml;

      // Actualizar folio en la factura
      await db.invoice.update({
        where: { id: invoiceId },
        data: { folio },
      });
    } else {
      // Si ya tiene folio, buscar el CAF correspondiente para el TED
      const cafRange = await db.cafRange.findFirst({
        where: {
          tenantId,
          documentType: invoice.documentType,
          environment,
          folioStart: { lte: folio },
          folioEnd: { gte: folio },
        },
      });

      if (cafRange) {
        const { decrypt } = await import("../../shared/crypto.js");
        cafPrivateKey = decrypt(cafRange.privateKey);
        cafXml = decrypt(cafRange.cafXml);
      }
    }

    // 4. Construir XML DTE
    const dteData: DteData = {
      documentType: invoice.documentType,
      folio,
      issueDate: invoice.issueDate,
      emisor: {
        rut: tenant.rutNormalized,
        razonSocial: tenant.businessName,
        giro: tenant.economicActivity ?? "Servicios varios",
        direccion: tenant.address ?? "Sin dirección",
        comuna: tenant.commune ?? "Santiago",
      },
      receptor: {
        rut: invoice.client.rutNormalized,
        razonSocial: invoice.client.businessName,
        giro: undefined,
        direccion: invoice.client.address ?? undefined,
        comuna: invoice.client.commune ?? undefined,
      },
      items: invoice.items.map((item) => ({
        lineNumber: item.lineNumber,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit ?? undefined,
        unitPrice: item.unitPrice,
        discount: item.discount,
        lineTotal: item.lineTotal,
        isExempt: item.isExempt,
      })),
      netAmount: invoice.netAmount,
      ivaRate: invoice.ivaRate,
      ivaAmount: invoice.ivaAmount,
      totalAmount: invoice.totalAmount,
      siiResolution: tenant.siiResolution ?? undefined,
      siiResolutionDate: tenant.siiResolutionDate ?? undefined,
    };

    const tedData = cafPrivateKey && cafXml
      ? { cafPrivateKey, cafXml }
      : undefined;

    const dteXml = this.dteBuilder.buildDteXml(dteData, tedData);

    // 5. Firmar XML DTE
    const signedDteXml = this.dteSigning.signDte(dteXml, privateKeyPem, certificatePem);

    // 6. Construir EnvioDTE
    const envioDteXml = this.dteSigning.buildEnvioDte(
      signedDteXml,
      { rut: tenant.rutNormalized, razonSocial: tenant.businessName },
      tenant.siiResolution ?? "0",
      tenant.siiResolutionDate ?? new Date(),
      privateKeyPem,
      certificatePem,
      environment,
    );

    // 7. Autenticar con el SII
    const { token } = await this.siiClient.authenticate(
      environment,
      privateKeyPem,
      certificatePem,
    );

    // 8. Enviar al SII
    const uploadResult = await this.siiClient.uploadDte(
      environment,
      token,
      tenant.rutNormalized,
      envioDteXml,
    );

    // 9. Actualizar la factura con el resultado
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        folio,
        siiStatus: "PENDING",
        siiTrackId: uploadResult.trackId,
        xmlSii: signedDteXml,
        siiResponse: {
          trackId: uploadResult.trackId,
          timestamp: uploadResult.timestamp,
          environment,
        },
      },
    });

    logger.info(
      {
        invoiceId,
        folio,
        trackId: uploadResult.trackId,
        environment,
      },
      "Factura enviada al SII",
    );

    return {
      folio,
      trackId: uploadResult.trackId,
      siiStatus: "PENDING",
      xmlSii: signedDteXml,
      environment,
    };
  }

  /**
   * Consulta el estado actual de una factura en el SII.
   */
  async queryInvoiceStatus(
    tenantId: string,
    invoiceId: string,
  ): Promise<QueryStatusResult> {
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { tenant: true },
    });

    if (!invoice) throw new NotFoundError("Factura");

    if (!invoice.siiTrackId) {
      throw new ValidationError("Esta factura no ha sido enviada al SII.");
    }

    const tenant = invoice.tenant;
    const environment = tenant.siiEnvironment;

    // Obtener credenciales para autenticarse
    const { privateKeyPem, certificatePem } =
      await this.certificateService.getSigningCredentials(tenantId);

    // Autenticar
    const { token } = await this.siiClient.authenticate(
      environment,
      privateKeyPem,
      certificatePem,
    );

    // Consultar estado
    const statusResult = await this.siiClient.queryStatus(
      environment,
      token,
      invoice.siiTrackId,
      tenant.rutNormalized,
    );

    // Traducir a nuestro enum
    const newStatus = this.siiClient.translateStatus(statusResult.status);

    // Actualizar estado en la factura
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        siiStatus: newStatus,
        siiResponse: {
          ...(invoice.siiResponse as Record<string, unknown> ?? {}),
          lastQuery: {
            status: statusResult.status,
            glosa: statusResult.glosa,
            numAtencion: statusResult.numAtencion,
            timestamp: new Date().toISOString(),
          },
        },
      },
    });

    logger.info(
      {
        invoiceId,
        trackId: invoice.siiTrackId,
        siiStatus: statusResult.status,
        ourStatus: newStatus,
      },
      "Estado SII actualizado",
    );

    return {
      siiStatus: newStatus,
      rawStatus: statusResult.status,
      glosa: statusResult.glosa,
      numAtencion: statusResult.numAtencion,
    };
  }

  /**
   * Obtiene la configuración SII actual del tenant.
   */
  async getSiiConfig(tenantId: string) {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        siiEnvironment: true,
        siiResolution: true,
        siiResolutionDate: true,
        siiCertificate: true,
        economicActivity: true,
        address: true,
        commune: true,
      },
    });

    if (!tenant) throw new NotFoundError("Tenant");

    const certInfo = await this.certificateService.getCertificateInfo(tenantId);

    return {
      environment: tenant.siiEnvironment,
      resolution: tenant.siiResolution,
      resolutionDate: tenant.siiResolutionDate,
      hasCertificate: !!tenant.siiCertificate,
      certificate: certInfo,
      economicActivity: tenant.economicActivity,
      address: tenant.address,
      commune: tenant.commune,
    };
  }

  /**
   * Actualiza la configuración SII del tenant.
   */
  async updateSiiConfig(
    tenantId: string,
    data: {
      siiEnvironment?: SiiEnvironment;
      siiResolution?: string;
      siiResolutionDate?: Date;
      economicActivity?: string;
      address?: string;
      commune?: string;
    },
  ) {
    return db.tenant.update({
      where: { id: tenantId },
      data,
      select: {
        siiEnvironment: true,
        siiResolution: true,
        siiResolutionDate: true,
        economicActivity: true,
        address: true,
        commune: true,
      },
    });
  }
}
