import { z } from "zod";
import "dotenv/config";

/**
 * Schema de validación de variables de entorno.
 * La app falla en startup si falta alguna variable requerida.
 * Esto garantiza que nunca arrancamos en un estado inconsistente.
 */
const envSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  APP_URL: z.string().url().default("http://localhost:3001"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),

  // Redis
  REDIS_URL: z.string().min(1, "REDIS_URL es requerida"),

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Encriptación (para credenciales SII)
  ENCRYPTION_KEY: z.string().length(32, "ENCRYPTION_KEY debe tener exactamente 32 caracteres").default("dev_encryption_key_32_chars_ok!!"),

  // SII
  SII_WSDL_CERTIFICATION: z.string().url().default("https://maullin.sii.cl/DTEWS/"),
  SII_WSDL_PRODUCTION: z.string().url().default("https://palena.sii.cl/DTEWS/"),

  // Email (Resend)
  RESEND_API_KEY: z.string().default("re_dev_placeholder"),
  EMAIL_FROM: z.string().email().default("notificaciones@pymeflow.cl"),
  EMAIL_FROM_NAME: z.string().default("PymeFlow"),

  // WhatsApp (Meta Business API) — opcionales para MVP
  META_ACCESS_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_WHATSAPP_API_URL: z.string().url().default("https://graph.facebook.com/v18.0"),

  // Stripe — opcionales para MVP
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Supabase Storage — opcionales para MVP
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),

  // Sentry — opcional
  SENTRY_DSN: z.string().url().optional(),

  // Web Push (VAPID) — opcionales para desarrollo
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:soporte@pymeflow.cl"),
});

// Parsear y exportar env validado
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

/** Variables de entorno validadas y tipadas */
export const env = parsed.data;

/** Tipo de las variables de entorno */
export type Env = z.infer<typeof envSchema>;
