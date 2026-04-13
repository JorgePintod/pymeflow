import { XMLParser } from "fast-xml-parser";
import { db } from "../../config/database.js";
import { encrypt, decrypt } from "../../shared/crypto.js";
import { ValidationError, NotFoundError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import type { DocumentType, SiiEnvironment } from "@prisma/client";

interface CafData {
  rut: string;
  razonSocial: string;
  documentType: number;
  folioStart: number;
  folioEnd: number;
  fechaAutorizacion: string;
  privateKey: string;  // RSA private key PEM del CAF
  publicKey: string;   // RSA public key PEM del CAF
}

/**
 * Servicio de gestión de CAF (Código de Autorización de Folios).
 * El SII entrega archivos XML con rangos de folios autorizados + claves RSA
 * que se usan para generar el Timbre Electrónico SII (TED).
 */
export class CafService {
  private parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => name === "FRMA",
  });

  /**
   * Sube y procesa un archivo CAF XML del SII.
   * Valida el contenido, encripta datos sensibles, y guarda el rango de folios.
   */
  async uploadCaf(
    tenantId: string,
    cafXml: string,
    environment: SiiEnvironment = "CERTIFICATION",
  ): Promise<{ folioStart: number; folioEnd: number; documentType: string; totalFolios: number }> {
    const cafData = this.parseCafXml(cafXml);

    // Mapear código SII a nuestro enum DocumentType
    const docType = this.siiCodeToDocType(cafData.documentType);

    // Verificar que no exista un rango superpuesto activo
    const existing = await db.cafRange.findFirst({
      where: {
        tenantId,
        documentType: docType,
        environment,
        isActive: true,
        OR: [
          {
            folioStart: { lte: cafData.folioEnd },
            folioEnd: { gte: cafData.folioStart },
          },
        ],
      },
    });

    if (existing) {
      throw new ValidationError(
        `Ya existe un rango CAF activo que se superpone (folios ${existing.folioStart}-${existing.folioEnd})`,
      );
    }

    // Encriptar XML y clave privada
    const encryptedXml = encrypt(cafXml);
    const encryptedPrivateKey = encrypt(cafData.privateKey);

    const cafRange = await db.cafRange.create({
      data: {
        tenantId,
        documentType: docType,
        environment,
        folioStart: cafData.folioStart,
        folioEnd: cafData.folioEnd,
        nextFolio: cafData.folioStart,
        cafXml: encryptedXml,
        privateKey: encryptedPrivateKey,
        publicKey: cafData.publicKey,
        authorizedAt: cafData.fechaAutorizacion
          ? new Date(cafData.fechaAutorizacion)
          : new Date(),
      },
    });

    logger.info(
      {
        tenantId,
        docType,
        folioStart: cafData.folioStart,
        folioEnd: cafData.folioEnd,
        environment,
      },
      "CAF subido exitosamente",
    );

    return {
      folioStart: cafData.folioStart,
      folioEnd: cafData.folioEnd,
      documentType: docType,
      totalFolios: cafData.folioEnd - cafData.folioStart + 1,
    };
  }

  /**
   * Reserva el siguiente folio disponible para un tipo de documento.
   * Usa transacción con SELECT FOR UPDATE para evitar folios duplicados.
   */
  async reserveFolio(
    tenantId: string,
    documentType: DocumentType,
    environment: SiiEnvironment,
  ): Promise<{ folio: number; cafId: string; privateKey: string; cafXml: string }> {
    return await db.$transaction(async (tx) => {
      // Buscar rango activo con folios disponibles
      const caf = await tx.cafRange.findFirst({
        where: {
          tenantId,
          documentType,
          environment,
          isActive: true,
          isExhausted: false,
        },
        orderBy: { folioStart: "asc" },
      });

      if (!caf) {
        throw new ValidationError(
          `No hay folios CAF disponibles para ${documentType}. Suba un nuevo archivo CAF desde el SII.`,
        );
      }

      const folio = caf.nextFolio;

      if (folio > caf.folioEnd) {
        // Marcar como agotado
        await tx.cafRange.update({
          where: { id: caf.id },
          data: { isExhausted: true, isActive: false },
        });
        throw new ValidationError(
          `Rango CAF agotado (${caf.folioStart}-${caf.folioEnd}). Suba un nuevo archivo CAF.`,
        );
      }

      // Incrementar nextFolio
      const isLastFolio = folio === caf.folioEnd;
      await tx.cafRange.update({
        where: { id: caf.id },
        data: {
          nextFolio: folio + 1,
          isExhausted: isLastFolio,
          isActive: !isLastFolio,
        },
      });

      // Desencriptar datos del CAF
      const privateKey = decrypt(caf.privateKey);
      const cafXml = decrypt(caf.cafXml);

      return { folio, cafId: caf.id, privateKey, cafXml };
    });
  }

  /**
   * Lista los rangos CAF disponibles para un tenant.
   */
  async listCafRanges(tenantId: string) {
    return db.cafRange.findMany({
      where: { tenantId },
      orderBy: [{ documentType: "asc" }, { folioStart: "desc" }],
      select: {
        id: true,
        documentType: true,
        environment: true,
        folioStart: true,
        folioEnd: true,
        nextFolio: true,
        isActive: true,
        isExhausted: true,
        authorizedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Desactiva un rango CAF.
   */
  async deactivateCaf(tenantId: string, cafId: string): Promise<void> {
    const caf = await db.cafRange.findFirst({
      where: { id: cafId, tenantId },
    });
    if (!caf) throw new NotFoundError("Rango CAF");

    await db.cafRange.update({
      where: { id: cafId },
      data: { isActive: false },
    });
  }

  /**
   * Parsea el XML CAF del SII y extrae los datos necesarios.
   */
  private parseCafXml(cafXml: string): CafData {
    let parsed: Record<string, unknown>;
    try {
      parsed = this.parser.parse(cafXml);
    } catch {
      throw new ValidationError("El archivo CAF no es un XML válido");
    }

    // Navegar estructura: AUTORIZACION > CAF > DA
    const autorizacion = (parsed as Record<string, Record<string, unknown>>).AUTORIZACION;
    if (!autorizacion) throw new ValidationError("Estructura CAF inválida: falta AUTORIZACION");

    const caf = autorizacion.CAF as Record<string, unknown> | undefined;
    if (!caf) throw new ValidationError("Estructura CAF inválida: falta CAF");

    const da = caf.DA as Record<string, unknown> | undefined;
    if (!da) throw new ValidationError("Estructura CAF inválida: falta DA");

    const re = da.RE as string; // RUT emisor
    const rs = da.RS as string; // Razón social
    const td = Number(da.TD);   // Tipo documento SII
    const rng = da.RNG as Record<string, unknown> | undefined;

    if (!rng) throw new ValidationError("Estructura CAF inválida: falta RNG (rango folios)");

    const folioStart = Number(rng.D); // Desde
    const folioEnd = Number(rng.H);   // Hasta
    const fecha = (da.FA as string) ?? "";

    if (!folioStart || !folioEnd || folioStart > folioEnd) {
      throw new ValidationError("Rango de folios inválido en el CAF");
    }

    // Extraer claves RSA del CAF
    const rsask = caf.RSASK as string | undefined; // Clave privada RSA
    const rsapk = (da.RSAPK as Record<string, unknown>) ?? {};

    if (!rsask) {
      throw new ValidationError("El CAF no contiene clave privada RSA (RSASK)");
    }

    // Reconstruir public key PEM del módulo+exponente si es necesario
    const modulus = rsapk.M as string;
    const exponent = rsapk.E as string;
    let publicKey = "";
    if (modulus && exponent) {
      publicKey = `<M>${modulus}</M><E>${exponent}</E>`;
    }

    return {
      rut: re,
      razonSocial: rs,
      documentType: td,
      folioStart,
      folioEnd,
      fechaAutorizacion: fecha,
      privateKey: rsask.trim(),
      publicKey,
    };
  }

  /**
   * Convierte código numérico SII a nuestro DocumentType enum.
   */
  private siiCodeToDocType(code: number): DocumentType {
    const map: Record<number, DocumentType> = {
      33: "FACTURA_ELECTRONICA",
      39: "BOLETA_ELECTRONICA",
      61: "NOTA_CREDITO_ELECTRONICA",
      56: "NOTA_DEBITO_ELECTRONICA",
      43: "LIQUIDACION_FACTURA",
      34: "FACTURA_EXENTA",
    };
    const docType = map[code];
    if (!docType) {
      throw new ValidationError(`Tipo de documento SII no soportado: ${code}`);
    }
    return docType;
  }
}
