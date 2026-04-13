import crypto from "node:crypto";
import { SignedXml } from "xml-crypto";
import { logger } from "../../shared/logger.js";

/**
 * Servicio de firma digital XML (XMLDSig) para DTEs del SII.
 * Usa la Signature Enveloped (firma dentro del documento) requerida por el SII.
 */
export class DteSigningService {
  /**
   * Firma un XML DTE con el certificado digital del emisor.
   * El SII requiere XMLDSig Enveloped + C14N + SHA1/RSA-SHA1.
   *
   * @param xml - XML DTE sin firmar (salida de DteBuilder)
   * @param privateKeyPem - Clave privada PEM del certificado .p12
   * @param certificatePem - Certificado X.509 PEM
   * @returns XML DTE firmado
   */
  signDte(xml: string, privateKeyPem: string, certificatePem: string): string {
    const sig = new SignedXml();

    // Configurar la referencia al Documento
    const documentIdMatch = xml.match(/ID="([^"]+)"/);
    const referenceUri = documentIdMatch ? `#${documentIdMatch[1]}` : "";

    sig.addReference({
      xpath: referenceUri
        ? `//*[@ID='${documentIdMatch![1]}']`
        : "//*[local-name(.)='Documento']",
      digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
      transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
    });

    sig.canonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
    sig.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
    sig.privateKey = privateKeyPem;
    sig.publicCert = certificatePem;

    // Agregar certificado X.509 al KeyInfo
    const cleanCert = certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");

    sig.getKeyInfoContent = () =>
      `<X509Data><X509Certificate>${cleanCert}</X509Certificate></X509Data>`;

    sig.computeSignature(xml, {
      location: { reference: "//*[local-name(.)='Documento']", action: "append" },
    });

    const signedXml = sig.getSignedXml();

    logger.debug("DTE firmado exitosamente");
    return signedXml;
  }

  /**
   * Genera el XML EnvioDTE (sobre) que envuelve uno o más DTEs firmados.
   * El SII requiere este formato para la recepción de documentos.
   */
  buildEnvioDte(
    signedDteXml: string,
    emisor: { rut: string; razonSocial: string },
    siiResolution: string,
    siiResolutionDate: Date,
    privateKeyPem: string,
    certificatePem: string,
    environment: "CERTIFICATION" | "PRODUCTION" = "CERTIFICATION",
  ): string {
    const rutEnvia = emisor.rut;
    const rutReceptor = environment === "CERTIFICATION" ? "60803000-K" : "60803000-K"; // SII RUT
    const resDateStr = siiResolutionDate.toISOString().split("T")[0];
    const timestampStr = new Date().toISOString().replace(/\.\d{3}Z$/, "");

    const envioXml = [
      '<?xml version="1.0" encoding="ISO-8859-1"?>',
      '<EnvioDTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      ' xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd" version="1.0">',
      `<SetDTE ID="SetDoc">`,
      '<Caratula version="1.0">',
      `<RutEmisor>${this.formatRutSii(rutEnvia)}</RutEmisor>`,
      `<RutEnvia>${this.formatRutSii(rutEnvia)}</RutEnvia>`,
      `<RutReceptor>${rutReceptor}</RutReceptor>`,
      `<FchResol>${resDateStr}</FchResol>`,
      `<NroResol>${siiResolution}</NroResol>`,
      `<TmstFirmaEnv>${timestampStr}</TmstFirmaEnv>`,
      '</Caratula>',
      signedDteXml,
      '</SetDTE>',
      '</EnvioDTE>',
    ].join("\n");

    // Firmar el sobre completo
    return this.signEnvio(envioXml, privateKeyPem, certificatePem);
  }

  /**
   * Firma el EnvioDTE (sobre) con XMLDSig.
   */
  private signEnvio(
    xml: string,
    privateKeyPem: string,
    certificatePem: string,
  ): string {
    const sig = new SignedXml();

    sig.addReference({
      xpath: "//*[local-name(.)='SetDTE']",
      digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
      transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
    });

    sig.canonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
    sig.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
    sig.privateKey = privateKeyPem;
    sig.publicCert = certificatePem;

    const cleanCert = certificatePem
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s/g, "");

    sig.getKeyInfoContent = () =>
      `<X509Data><X509Certificate>${cleanCert}</X509Certificate></X509Data>`;

    sig.computeSignature(xml, {
      location: { reference: "//*[local-name(.)='EnvioDTE']", action: "prepend" },
    });

    return sig.getSignedXml();
  }

  private formatRutSii(rut: string): string {
    const clean = rut.replace(/[.\s]/g, "");
    if (clean.includes("-")) return clean;
    return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
  }
}
