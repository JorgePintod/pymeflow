import { XMLParser } from "fast-xml-parser";
import { env } from "../../config/env.js";
import { SiiError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import type { SiiEnvironment } from "@prisma/client";

interface SiiAuthResult {
  token: string;
}

interface SiiUploadResult {
  trackId: string;
  timestamp: string;
}

interface SiiStatusResult {
  trackId: string;
  status: "DOK" | "RPR" | "RCT" | "RFR" | "SOK" | "CRT" | "PRD" | "-11" | string;
  glosa: string;
  numAtencion: string;
}

/**
 * Cliente HTTP para comunicarse con los Web Services del SII de Chile.
 * Soporta ambiente de certificación (maullin) y producción (palena).
 *
 * Endpoints principales:
 * - GetTokenFromSeed: Obtener token de autenticación
 * - RecepcionDTE: Enviar DTE al SII
 * - QueryEstDTE: Consultar estado de un envío
 *
 * En modo desarrollo (sin certificado), simula las respuestas.
 */
export class SiiApiClient {
  private parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  /**
   * Obtiene un token de autenticación del SII.
   * Paso 1: Request seed → Paso 2: Firmar seed → Paso 3: Get token
   */
  async authenticate(
    environment: SiiEnvironment,
    privateKeyPem: string,
    certificatePem: string,
  ): Promise<SiiAuthResult> {
    const baseUrl = this.getBaseUrl(environment);

    // En modo dev sin certificado real, simular
    if (env.NODE_ENV === "development" && privateKeyPem.includes("PLACEHOLDER")) {
      return { token: `dev-token-${Date.now()}` };
    }

    // Paso 1: Obtener semilla
    const seedUrl = `${baseUrl}CrSeed.jws?WSDL`;
    const seedResponse = await this.soapRequest(seedUrl, this.buildGetSeedEnvelope());
    const seed = this.extractSeed(seedResponse);

    if (!seed) {
      throw new SiiError("No se pudo obtener semilla del SII");
    }

    // Paso 2: Firmar semilla y obtener token
    const signedSeed = this.signSeed(seed, privateKeyPem, certificatePem);
    const tokenUrl = `${baseUrl}GetTokenFromSeed.jws?WSDL`;
    const tokenResponse = await this.soapRequest(
      tokenUrl,
      this.buildGetTokenEnvelope(signedSeed),
    );
    const token = this.extractToken(tokenResponse);

    if (!token) {
      throw new SiiError("No se pudo obtener token del SII. Verifique su certificado.");
    }

    logger.info({ environment }, "Autenticación SII exitosa");
    return { token };
  }

  /**
   * Envía un EnvioDTE firmado al SII.
   */
  async uploadDte(
    environment: SiiEnvironment,
    token: string,
    rutEmisor: string,
    envioDteXml: string,
  ): Promise<SiiUploadResult> {
    const baseUrl = this.getBaseUrl(environment);

    // Modo simulación
    if (token.startsWith("dev-token-")) {
      const simulatedTrackId = `T${Date.now()}`;
      logger.info(
        { trackId: simulatedTrackId, environment },
        "Envío DTE simulado (modo desarrollo)",
      );
      return {
        trackId: simulatedTrackId,
        timestamp: new Date().toISOString(),
      };
    }

    const uploadUrl = `${baseUrl}RecepcionDTE.jws?WSDL`;
    const rutClean = rutEmisor.replace(/[.\s-]/g, "");
    const rutBody = rutClean.slice(0, -1);
    const rutDv = rutClean.slice(-1);

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data",
        Cookie: `TOKEN=${token}`,
      },
      body: this.buildUploadBody(rutBody, rutDv, envioDteXml),
    });

    if (!response.ok) {
      throw new SiiError(
        `Error HTTP del SII: ${response.status} ${response.statusText}`,
        { status: response.status },
      );
    }

    const responseText = await response.text();
    const parsed = this.parser.parse(responseText);

    // Extraer TRACKID de la respuesta
    const trackId = this.extractTrackId(parsed);

    if (!trackId) {
      logger.error({ response: responseText }, "Respuesta SII sin TrackID");
      throw new SiiError("El SII no retornó un TrackID válido", {
        response: responseText.slice(0, 500),
      });
    }

    logger.info({ trackId, environment }, "DTE enviado al SII exitosamente");
    return {
      trackId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Consulta el estado de un envío previo al SII.
   */
  async queryStatus(
    environment: SiiEnvironment,
    token: string,
    trackId: string,
    rutEmisor: string,
  ): Promise<SiiStatusResult> {
    // Modo simulación
    if (token.startsWith("dev-token-")) {
      return {
        trackId,
        status: "DOK",
        glosa: "Documento aceptado (simulación)",
        numAtencion: `SIM-${Date.now()}`,
      };
    }

    const baseUrl = this.getBaseUrl(environment);
    const rutClean = rutEmisor.replace(/[.\s-]/g, "");
    const rutBody = rutClean.slice(0, -1);
    const rutDv = rutClean.slice(-1);

    const queryUrl =
      `${baseUrl}QueryEstUp.jws?WSDL` +
      `&RutQuery=${rutBody}&DvQuery=${rutDv}&TrackId=${trackId}`;

    const response = await fetch(queryUrl, {
      method: "GET",
      headers: { Cookie: `TOKEN=${token}` },
    });

    if (!response.ok) {
      throw new SiiError(`Error HTTP consultando estado SII: ${response.status}`);
    }

    const responseText = await response.text();
    const parsed = this.parser.parse(responseText);
    const estado = this.extractEstado(parsed);

    logger.info({ trackId, status: estado.status }, "Estado SII consultado");
    return estado;
  }

  /**
   * Traduce el código de estado SII a nuestro SiiDocumentStatus.
   */
  translateStatus(
    siiStatus: string,
  ): "ACCEPTED" | "REJECTED" | "OBJECTED" | "PENDING" {
    switch (siiStatus) {
      case "DOK": // Documento OK
      case "SOK": // Schema OK
        return "ACCEPTED";
      case "RCT": // Rechazado por error en contribuyente
      case "RFR": // Rechazado por error formal
        return "REJECTED";
      case "RPR": // Reparo
        return "OBJECTED";
      case "CRT": // Certificación OK
        return "ACCEPTED";
      default:
        return "PENDING";
    }
  }

  // ─── Helpers privados ────────────────────────────

  private getBaseUrl(environment: SiiEnvironment): string {
    return environment === "PRODUCTION"
      ? env.SII_WSDL_PRODUCTION
      : env.SII_WSDL_CERTIFICATION;
  }

  private async soapRequest(url: string, body: string): Promise<string> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
      },
      body,
    });

    if (!response.ok) {
      throw new SiiError(`Error de comunicación con SII: ${response.status}`);
    }

    return response.text();
  }

  private buildGetSeedEnvelope(): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">',
      "<soapenv:Body>",
      "<getSeed/>",
      "</soapenv:Body>",
      "</soapenv:Envelope>",
    ].join("");
  }

  private buildGetTokenEnvelope(signedSeedXml: string): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">',
      "<soapenv:Body>",
      "<getToken>",
      `<pszXml>${this.escapeXml(signedSeedXml)}</pszXml>`,
      "</getToken>",
      "</soapenv:Body>",
      "</soapenv:Envelope>",
    ].join("");
  }

  private signSeed(
    seed: string,
    privateKeyPem: string,
    certificatePem: string,
  ): string {
    const crypto = require("node:crypto") as typeof import("node:crypto");
    const seedXml = `<getToken><item><Semilla>${seed}</Semilla></item></getToken>`;

    // Firma simple del seed
    const sign = crypto.createSign("SHA1");
    sign.update(seedXml);
    const signature = sign.sign(privateKeyPem, "base64");

    const cleanCert = certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");

    return [
      seedXml.replace("</getToken>", ""),
      "<Signature>",
      `<SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>`,
      `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>`,
      `<Reference><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>`,
      `<DigestValue></DigestValue></Reference></SignedInfo>`,
      `<SignatureValue>${signature}</SignatureValue>`,
      `<KeyInfo><X509Data><X509Certificate>${cleanCert}</X509Certificate></X509Data></KeyInfo>`,
      "</Signature>",
      "</getToken>",
    ].join("");
  }

  private extractSeed(responseXml: string): string | null {
    const match = responseXml.match(/<SEMILLA>(\d+)<\/SEMILLA>/);
    return match?.[1] ?? null;
  }

  private extractToken(responseXml: string): string | null {
    const match = responseXml.match(/<TOKEN>([^<]+)<\/TOKEN>/);
    return match?.[1] ?? null;
  }

  private extractTrackId(parsed: Record<string, unknown>): string | null {
    // La respuesta tiene varias estructuras posibles
    const findTrackId = (obj: unknown): string | null => {
      if (obj === null || obj === undefined) return null;
      if (typeof obj === "string") return null;
      if (typeof obj === "number") return null;
      if (typeof obj !== "object") return null;

      const record = obj as Record<string, unknown>;
      if ("TRACKID" in record) return String(record.TRACKID);
      if ("TrackId" in record) return String(record.TrackId);

      for (const value of Object.values(record)) {
        const found = findTrackId(value);
        if (found) return found;
      }
      return null;
    };

    return findTrackId(parsed);
  }

  private extractEstado(parsed: Record<string, unknown>): SiiStatusResult {
    const findEstado = (obj: unknown): Partial<SiiStatusResult> => {
      if (!obj || typeof obj !== "object") return {};
      const rec = obj as Record<string, unknown>;

      if ("ESTADO" in rec || "EstadoDTE" in rec) {
        return {
          status: String(rec.ESTADO ?? rec.EstadoDTE ?? ""),
          glosa: String(rec.GLOSA ?? rec.GlosaDTE ?? ""),
          numAtencion: String(rec.NUM_ATENCION ?? rec.NumAtencion ?? ""),
        };
      }

      for (const value of Object.values(rec)) {
        const found = findEstado(value);
        if (found.status) return found;
      }
      return {};
    };

    const estado = findEstado(parsed);
    return {
      trackId: "",
      status: estado.status ?? "UNKNOWN",
      glosa: estado.glosa ?? "",
      numAtencion: estado.numAtencion ?? "",
    };
  }

  private buildUploadBody(rutBody: string, rutDv: string, envioDteXml: string): string {
    const boundary = `----SIIBoundary${Date.now()}`;
    return [
      `--${boundary}`,
      'Content-Disposition: form-data; name="rutSender"',
      "",
      rutBody,
      `--${boundary}`,
      'Content-Disposition: form-data; name="dvSender"',
      "",
      rutDv,
      `--${boundary}`,
      'Content-Disposition: form-data; name="archivo"; filename="envio.xml"',
      "Content-Type: text/xml",
      "",
      envioDteXml,
      `--${boundary}--`,
    ].join("\r\n");
  }

  private escapeXml(xml: string): string {
    return xml
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
