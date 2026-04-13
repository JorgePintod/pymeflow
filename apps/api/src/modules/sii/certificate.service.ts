import forge from "node-forge";
import { db } from "../../config/database.js";
import { encrypt, decrypt } from "../../shared/crypto.js";
import { ValidationError, NotFoundError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";

export interface CertificateInfo {
  subject: {
    commonName: string;
    serialNumber?: string; // RUT del firmante
    organization?: string;
    email?: string;
  };
  issuer: string;
  validFrom: Date;
  validTo: Date;
  isValid: boolean;
  serialNumber: string;
}

/**
 * Servicio de gestión de certificados digitales (.p12) para el SII.
 * Los certificados se encriptan con AES-256-GCM antes de almacenar en la BD.
 */
export class CertificateService {
  /**
   * Sube y valida un certificado digital .p12.
   * Encripta el p12 y la contraseña antes de guardar en BD.
   */
  async uploadCertificate(
    tenantId: string,
    p12Base64: string,
    password: string,
  ): Promise<CertificateInfo> {
    // Decodificar y validar el P12
    const p12Buffer = Buffer.from(p12Base64, "base64");
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Buffer));

    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    } catch {
      throw new ValidationError(
        "No se pudo abrir el certificado. Verifique que la contraseña sea correcta.",
      );
    }

    // Extraer certificado y clave privada
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

    const certBagOid = forge.pki.oids.certBag as string;
    const keyBagOid = forge.pki.oids.pkcs8ShroudedKeyBag as string;
    const certBag = certBags[certBagOid];
    const keyBag = keyBags[keyBagOid];

    if (!certBag || certBag.length === 0 || !certBag[0]?.cert) {
      throw new ValidationError("El certificado no contiene un certificado X.509 válido");
    }

    if (!keyBag || keyBag.length === 0 || !keyBag[0]?.key) {
      throw new ValidationError("El certificado no contiene una clave privada válida");
    }

    const cert = certBag[0]!.cert!;
    const now = new Date();
    const validFrom = cert.validity.notBefore;
    const validTo = cert.validity.notAfter;

    if (now > validTo) {
      throw new ValidationError(
        `El certificado expiró el ${validTo.toLocaleDateString("es-CL")}. Debe renovarlo.`,
      );
    }

    // Extraer info del sujeto
    const getAttr = (shortName: string) =>
      cert.subject.getField(shortName)?.value as string | undefined;

    const info: CertificateInfo = {
      subject: {
        commonName: getAttr("CN") ?? "Desconocido",
        serialNumber: getAttr("serialNumber"), // RUT del firmante
        organization: getAttr("O"),
        email: getAttr("E") ?? getAttr("emailAddress"),
      },
      issuer: cert.issuer.getField("CN")?.value as string ?? "Desconocido",
      validFrom,
      validTo,
      isValid: now >= validFrom && now <= validTo,
      serialNumber: cert.serialNumber,
    };

    // Encriptar certificado y contraseña
    const encryptedCert = encrypt(p12Base64);
    const encryptedPassword = encrypt(password);

    // Guardar en tenant
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        siiCertificate: encryptedCert,
        siiCertPassword: encryptedPassword,
      },
    });

    logger.info(
      { tenantId, cn: info.subject.commonName, validTo },
      "Certificado digital cargado exitosamente",
    );

    return info;
  }

  /**
   * Obtiene la info del certificado actual del tenant (sin devolver datos sensibles).
   */
  async getCertificateInfo(tenantId: string): Promise<CertificateInfo | null> {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { siiCertificate: true, siiCertPassword: true },
    });

    if (!tenant?.siiCertificate || !tenant?.siiCertPassword) return null;

    try {
      const p12Base64 = decrypt(tenant.siiCertificate);
      const password = decrypt(tenant.siiCertPassword);
      return this.parseCertificate(p12Base64, password);
    } catch (err) {
      logger.error({ tenantId, err }, "Error al leer certificado almacenado");
      return null;
    }
  }

  /**
   * Extrae la clave privada y el certificado X.509 del P12 almacenado.
   * Usado internamente para firmar DTEs.
   */
  async getSigningCredentials(
    tenantId: string,
  ): Promise<{ privateKeyPem: string; certificatePem: string; certInfo: CertificateInfo }> {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { siiCertificate: true, siiCertPassword: true },
    });

    if (!tenant?.siiCertificate || !tenant?.siiCertPassword) {
      throw new ValidationError(
        "No hay certificado digital configurado. Cargue su archivo .p12 primero.",
      );
    }

    const p12Base64 = decrypt(tenant.siiCertificate);
    const password = decrypt(tenant.siiCertPassword);

    const p12Buffer = Buffer.from(p12Base64, "base64");
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Buffer));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

    const certBagOid = forge.pki.oids.certBag as string;
    const keyBagOid = forge.pki.oids.pkcs8ShroudedKeyBag as string;
    const cert = certBags[certBagOid]?.[0]?.cert;
    const key = keyBags[keyBagOid]?.[0]?.key;

    if (!cert || !key) {
      throw new ValidationError("Certificado digital dañado o inválido");
    }

    const privateKeyPem = forge.pki.privateKeyToPem(key);
    const certificatePem = forge.pki.certificateToPem(cert);

    const certInfo = this.extractCertInfo(cert);

    return { privateKeyPem, certificatePem, certInfo };
  }

  /**
   * Elimina el certificado del tenant.
   */
  async removeCertificate(tenantId: string): Promise<void> {
    await db.tenant.update({
      where: { id: tenantId },
      data: {
        siiCertificate: null,
        siiCertPassword: null,
      },
    });
  }

  private parseCertificate(p12Base64: string, password: string): CertificateInfo {
    const p12Buffer = Buffer.from(p12Base64, "base64");
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Buffer));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBagOid = forge.pki.oids.certBag as string;
    const cert = certBags[certBagOid]?.[0]?.cert;
    if (!cert) throw new ValidationError("Certificado inválido");

    return this.extractCertInfo(cert);
  }

  private extractCertInfo(cert: forge.pki.Certificate): CertificateInfo {
    const getAttr = (shortName: string) =>
      cert.subject.getField(shortName)?.value as string | undefined;

    const now = new Date();
    return {
      subject: {
        commonName: getAttr("CN") ?? "Desconocido",
        serialNumber: getAttr("serialNumber"),
        organization: getAttr("O"),
        email: getAttr("E") ?? getAttr("emailAddress"),
      },
      issuer: cert.issuer.getField("CN")?.value as string ?? "Desconocido",
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      isValid: now >= cert.validity.notBefore && now <= cert.validity.notAfter,
      serialNumber: cert.serialNumber,
    };
  }
}
