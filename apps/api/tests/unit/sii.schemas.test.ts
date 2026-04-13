import { describe, it, expect } from "vitest";
import { z } from "zod";

// Recreate the schemas from sii.routes.ts for unit testing
const uploadCertificateSchema = z.object({
  p12Base64: z.string().min(1, "El certificado es requerido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

const uploadCafSchema = z.object({
  cafXml: z.string().min(1, "El XML CAF es requerido"),
  environment: z.enum(["CERTIFICATION", "PRODUCTION"]).optional(),
});

const updateConfigSchema = z.object({
  siiEnvironment: z.enum(["CERTIFICATION", "PRODUCTION"]).optional(),
  siiResolution: z.string().nullable().optional(),
  siiResolutionDate: z.string().nullable().optional(),
  economicActivity: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  commune: z.string().nullable().optional(),
});

describe("SII Schema Validation", () => {
  describe("uploadCertificateSchema", () => {
    it("debe aceptar datos válidos", () => {
      const result = uploadCertificateSchema.safeParse({
        p12Base64: "SGVsbG8gV29ybGQ=",
        password: "miPassword123",
      });
      expect(result.success).toBe(true);
    });

    it("debe rechazar p12Base64 vacío", () => {
      const result = uploadCertificateSchema.safeParse({
        p12Base64: "",
        password: "test",
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar password vacía", () => {
      const result = uploadCertificateSchema.safeParse({
        p12Base64: "data",
        password: "",
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar sin campos requeridos", () => {
      const result = uploadCertificateSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("uploadCafSchema", () => {
    it("debe aceptar XML CAF válido sin environment", () => {
      const result = uploadCafSchema.safeParse({
        cafXml: "<AUTORIZACION>...</AUTORIZACION>",
      });
      expect(result.success).toBe(true);
    });

    it("debe aceptar environment CERTIFICATION", () => {
      const result = uploadCafSchema.safeParse({
        cafXml: "<CAF>data</CAF>",
        environment: "CERTIFICATION",
      });
      expect(result.success).toBe(true);
    });

    it("debe aceptar environment PRODUCTION", () => {
      const result = uploadCafSchema.safeParse({
        cafXml: "<CAF>data</CAF>",
        environment: "PRODUCTION",
      });
      expect(result.success).toBe(true);
    });

    it("debe rechazar environment inválido", () => {
      const result = uploadCafSchema.safeParse({
        cafXml: "<CAF>data</CAF>",
        environment: "INVALID",
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar XML vacío", () => {
      const result = uploadCafSchema.safeParse({ cafXml: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("updateConfigSchema", () => {
    it("debe aceptar actualización parcial", () => {
      const result = updateConfigSchema.safeParse({
        siiEnvironment: "CERTIFICATION",
      });
      expect(result.success).toBe(true);
    });

    it("debe aceptar todos los campos", () => {
      const result = updateConfigSchema.safeParse({
        siiEnvironment: "PRODUCTION",
        siiResolution: "80",
        siiResolutionDate: "2023-08-22",
        economicActivity: "Desarrollo de Software",
        address: "Av. Providencia 1234",
        commune: "Providencia",
      });
      expect(result.success).toBe(true);
    });

    it("debe aceptar campos nulos", () => {
      const result = updateConfigSchema.safeParse({
        siiResolution: null,
        siiResolutionDate: null,
      });
      expect(result.success).toBe(true);
    });

    it("debe rechazar environment inválido", () => {
      const result = updateConfigSchema.safeParse({
        siiEnvironment: "SANDBOX",
      });
      expect(result.success).toBe(false);
    });

    it("debe aceptar objeto vacío (sin cambios)", () => {
      const result = updateConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
