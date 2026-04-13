import crypto from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Servicio de encriptación AES-256-GCM para credenciales sensibles del SII.
 * Nunca se almacenan contraseñas de certificados ni XML CAF en texto plano.
 */
function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, "utf8");
}

/**
 * Encripta un texto usando AES-256-GCM.
 * Retorna: iv:authTag:ciphertext (hex-encoded, separados por ':')
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Desencripta un texto previamente encriptado con encrypt().
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Formato de texto encriptado inválido");
  }

  const [ivHex, authTagHex, ciphertext] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted: string = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
