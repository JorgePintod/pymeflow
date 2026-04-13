import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema, refreshTokenSchema } from "../../src/modules/auth/auth.schema.js";

describe("auth.schema", () => {
  describe("registerSchema", () => {
    const validData = {
      businessName: "Mi Empresa SpA",
      rut: "76.543.210-9",
      firstName: "Jorge",
      lastName: "Pinto",
      email: "jorge@empresa.cl",
      password: "MiPassword123",
    };

    it("debe aceptar datos válidos", () => {
      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("debe rechazar email inválido", () => {
      const result = registerSchema.safeParse({
        ...validData,
        email: "no-es-email",
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar contraseña sin mayúscula", () => {
      const result = registerSchema.safeParse({
        ...validData,
        password: "solopequenas123",
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar contraseña sin número", () => {
      const result = registerSchema.safeParse({
        ...validData,
        password: "SinNumeros",
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar contraseña corta (< 8 chars)", () => {
      const result = registerSchema.safeParse({
        ...validData,
        password: "Ab1",
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar razón social vacía", () => {
      const result = registerSchema.safeParse({
        ...validData,
        businessName: "",
      });
      expect(result.success).toBe(false);
    });

    it("debe normalizar email a minúsculas", () => {
      const result = registerSchema.safeParse({
        ...validData,
        email: "Jorge@Empresa.CL",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("jorge@empresa.cl");
      }
    });

    it("debe aceptar teléfono chileno válido", () => {
      const result = registerSchema.safeParse({
        ...validData,
        phone: "+56912345678",
      });
      expect(result.success).toBe(true);
    });

    it("debe rechazar teléfono con formato incorrecto", () => {
      const result = registerSchema.safeParse({
        ...validData,
        phone: "12345",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("loginSchema", () => {
    it("debe aceptar credenciales válidas", () => {
      const result = loginSchema.safeParse({
        email: "jorge@empresa.cl",
        password: "MiPassword123",
      });
      expect(result.success).toBe(true);
    });

    it("debe rechazar email inválido", () => {
      const result = loginSchema.safeParse({
        email: "no-email",
        password: "algo",
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar contraseña vacía", () => {
      const result = loginSchema.safeParse({
        email: "jorge@empresa.cl",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("refreshTokenSchema", () => {
    it("debe aceptar token no vacío", () => {
      const result = refreshTokenSchema.safeParse({
        refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      });
      expect(result.success).toBe(true);
    });

    it("debe rechazar token vacío", () => {
      const result = refreshTokenSchema.safeParse({
        refreshToken: "",
      });
      expect(result.success).toBe(false);
    });
  });
});
