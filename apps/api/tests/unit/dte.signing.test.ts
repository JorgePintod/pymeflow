import { describe, it, expect, vi } from "vitest";
import { DteSigningService } from "../../src/modules/sii/dte.signing.js";

// Mock logger
vi.mock("../../src/shared/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

describe("DteSigningService", () => {
  const service = new DteSigningService();

  describe("signDte", () => {
    it("debe agregar Signature al XML", () => {
      // Generar un par de claves para testing
      const crypto = require("node:crypto");
      const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
      // Simular un certificado usando el PEM de la clave pública como placeholder
      // En la práctica real, esto sería un certificado X.509 auto-firmado
      const forge = require("node-forge");
      const issuer = [{ name: "commonName", value: "Test CA" }];
      const cert = forge.pki.createCertificate();
      cert.publicKey = forge.pki.publicKeyFromPem(
        publicKey.export({ type: "spki", format: "pem" }),
      );
      cert.serialNumber = "01";
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
      cert.setSubject(issuer);
      cert.setIssuer(issuer);
      cert.sign(forge.pki.privateKeyFromPem(privateKeyPem));
      const certPem = forge.pki.certificateToPem(cert);

      const xml = '<DTE version="1.0"><Documento ID="DTE-33-1"><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>1</Folio></IdDoc></Encabezado></Documento></DTE>';

      const signedXml = service.signDte(xml, privateKeyPem, certPem);

      expect(signedXml).toContain("<Signature");
      expect(signedXml).toContain("<SignatureValue>");
      expect(signedXml).toContain("<X509Certificate>");
      expect(signedXml).toContain("<DigestValue>");
    });
  });

  describe("buildEnvioDte", () => {
    it("debe generar estructura EnvioDTE correcta", () => {
      const crypto = require("node:crypto");
      const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
      const forge = require("node-forge");
      const issuer = [{ name: "commonName", value: "Test CA" }];
      const cert = forge.pki.createCertificate();
      cert.publicKey = forge.pki.publicKeyFromPem(
        publicKey.export({ type: "spki", format: "pem" }),
      );
      cert.serialNumber = "01";
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
      cert.setSubject(issuer);
      cert.setIssuer(issuer);
      cert.sign(forge.pki.privateKeyFromPem(privateKeyPem));
      const certPem = forge.pki.certificateToPem(cert);

      const signedDteXml = '<Documento ID="DTE-33-1"><Encabezado></Encabezado></Documento>';

      const envio = service.buildEnvioDte(
        signedDteXml,
        { rut: "76543210-K", razonSocial: "Test SPA" },
        "80",
        new Date("2023-08-22"),
        privateKeyPem,
        certPem,
        "CERTIFICATION",
      );

      expect(envio).toContain("<EnvioDTE");
      expect(envio).toContain("<SetDTE");
      expect(envio).toContain("<Caratula");
      expect(envio).toContain("<RutEmisor>76543210-K</RutEmisor>");
      expect(envio).toContain("<NroResol>80</NroResol>");
      expect(envio).toContain("<FchResol>2023-08-22</FchResol>");
      expect(envio).toContain("<Signature");
    });
  });

  describe("formatRutSii (private, tested via output)", () => {
    it("debe formatear RUT correctamente en buildEnvioDte", () => {
      const crypto = require("node:crypto");
      const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
      const forge = require("node-forge");
      const issuer = [{ name: "commonName", value: "Test" }];
      const cert = forge.pki.createCertificate();
      cert.publicKey = forge.pki.publicKeyFromPem(
        publicKey.export({ type: "spki", format: "pem" }),
      );
      cert.serialNumber = "01";
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
      cert.setSubject(issuer);
      cert.setIssuer(issuer);
      cert.sign(forge.pki.privateKeyFromPem(privateKeyPem));
      const certPem = forge.pki.certificateToPem(cert);

      // RUT con puntos debería quedar sin puntos
      const envio = service.buildEnvioDte(
        "<Documento></Documento>",
        { rut: "76.543.210-K", razonSocial: "Test" },
        "80",
        new Date("2023-01-01"),
        privateKeyPem,
        certPem,
      );

      expect(envio).toContain("76543210-K");
      expect(envio).not.toContain("76.543.210");
    });
  });
});
