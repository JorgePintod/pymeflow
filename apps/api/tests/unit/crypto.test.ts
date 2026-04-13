import { describe, it, expect, vi, beforeEach } from "vitest";
import { encrypt, decrypt } from "../../src/shared/crypto.js";

// Mock env
vi.mock("../../src/config/env.js", () => ({
  env: {
    ENCRYPTION_KEY: "dev_encryption_key_32_chars_ok!!",
  },
}));

describe("crypto", () => {
  describe("encrypt / decrypt", () => {
    it("debe encriptar y desencriptar correctamente", () => {
      const plaintext = "mi secreto seguro";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("debe producir formato iv:authTag:ciphertext", () => {
      const encrypted = encrypt("test");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      // IV hex = 32 chars (16 bytes)
      expect(parts[0]).toHaveLength(32);
      // AuthTag hex = 32 chars (16 bytes)
      expect(parts[1]).toHaveLength(32);
      // Ciphertext hex > 0
      expect(parts[2]!.length).toBeGreaterThan(0);
    });

    it("debe generar IVs distintos para el mismo texto", () => {
      const e1 = encrypt("mismo texto");
      const e2 = encrypt("mismo texto");
      expect(e1).not.toBe(e2);
      // Pero ambos se desencriptan al mismo valor
      expect(decrypt(e1)).toBe(decrypt(e2));
    });

    it("debe lanzar error con formato inválido", () => {
      expect(() => decrypt("invalido")).toThrow("Formato de texto encriptado inválido");
    });

    it("debe manejar strings vacíos", () => {
      const encrypted = encrypt("");
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe("");
    });

    it("debe manejar strings largos (XML CAF)", () => {
      const longStr = "<CAF>" + "x".repeat(10000) + "</CAF>";
      const encrypted = encrypt(longStr);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(longStr);
    });

    it("debe manejar caracteres UTF-8", () => {
      const text = "Certificado válido — año 2024 — José García ñ";
      const encrypted = encrypt(text);
      expect(decrypt(encrypted)).toBe(text);
    });
  });
});
