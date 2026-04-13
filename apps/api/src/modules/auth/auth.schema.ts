import { z } from "zod";

/**
 * Schema de validación para registro de nuevo tenant + usuario dueño.
 * Valida RUT chileno, email, contraseña segura y datos de la empresa.
 */
export const registerSchema = z.object({
  // Datos de la empresa (tenant)
  businessName: z
    .string()
    .min(2, "La razón social debe tener al menos 2 caracteres")
    .max(200, "La razón social no puede exceder 200 caracteres")
    .trim(),
  rut: z
    .string()
    .min(8, "El RUT debe tener al menos 8 caracteres")
    .max(12, "El RUT no puede exceder 12 caracteres")
    .trim(),
  economicActivity: z
    .string()
    .max(200)
    .optional(),
  phone: z
    .string()
    .regex(/^\+?569\d{8}$/, "El teléfono debe tener formato chileno (+569XXXXXXXX)")
    .optional(),

  // Datos del usuario dueño
  firstName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100)
    .trim(),
  lastName: z
    .string()
    .min(2, "El apellido debe tener al menos 2 caracteres")
    .max(100)
    .trim(),
  email: z
    .string()
    .email("El email no es válido")
    .max(255)
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(128, "La contraseña no puede exceder 128 caracteres")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "La contraseña debe contener al menos una mayúscula, una minúscula y un número"
    ),
});

/** Tipo inferido del DTO de registro */
export type RegisterDto = z.infer<typeof registerSchema>;

/**
 * Schema de validación para inicio de sesión.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .email("El email no es válido")
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(1, "La contraseña es requerida"),
});

/** Tipo inferido del DTO de login */
export type LoginDto = z.infer<typeof loginSchema>;

/**
 * Schema de validación para refresh token.
 */
export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(1, "El refresh token es requerido"),
});

/** Tipo inferido del DTO de refresh */
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

/**
 * Schema de respuesta de autenticación (para documentación Swagger).
 * Define la forma de la respuesta exitosa de login/register.
 */
export const authResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.string(),
  }),
  tenant: z.object({
    id: z.string(),
    businessName: z.string(),
    rut: z.string(),
    plan: z.string(),
  }),
  accessToken: z.string(),
  refreshToken: z.string(),
});

/** Tipo inferido de la respuesta de auth */
export type AuthResponse = z.infer<typeof authResponseSchema>;
