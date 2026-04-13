import type { FastifyInstance } from "fastify";
import { AuthService } from "./auth.service.js";
import { registerSchema, loginSchema, refreshTokenSchema } from "./auth.schema.js";
import { authenticate } from "./auth.middleware.js";
import { ValidationError } from "../../shared/errors.js";
import { RATE_LIMITS } from "../../config/constants.js";

const authService = new AuthService();

/**
 * Rutas del módulo de autenticación.
 * Prefijo: /api/v1/auth
 *
 * POST /register  — Registrar nuevo tenant + usuario
 * POST /login     — Iniciar sesión
 * POST /refresh   — Renovar access token
 * POST /logout    — Cerrar sesión
 * GET  /me        — Obtener perfil del usuario autenticado
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /register
   * Registra una nueva empresa (tenant) y su usuario dueño.
   * Rate limit estricto: 3 intentos por IP cada hora.
   */
  app.post(
    "/register",
    {
      config: {
        rateLimit: RATE_LIMITS.REGISTER,
      },
    },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new ValidationError("Datos de registro inválidos", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await authService.register(parsed.data);

      return reply.status(201).send({
        success: true,
        data: result,
      });
    }
  );

  /**
   * POST /login
   * Autentica un usuario con email y contraseña.
   * Rate limit estricto: 5 intentos por IP cada 15 minutos.
   */
  app.post(
    "/login",
    {
      config: {
        rateLimit: RATE_LIMITS.LOGIN,
      },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new ValidationError("Credenciales inválidas", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const ipAddress = request.ip;
      const userAgent = request.headers["user-agent"];

      const result = await authService.login(parsed.data, ipAddress, userAgent);

      return reply.send({
        success: true,
        data: result,
      });
    }
  );

  /**
   * POST /refresh
   * Renueva el access token usando el refresh token.
   * Implementa rotación: el refresh token anterior se revoca.
   */
  app.post("/refresh", async (request, reply) => {
    const parsed = refreshTokenSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new ValidationError("Refresh token requerido", {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const tokens = await authService.refreshToken(parsed.data.refreshToken);

    return reply.send({
      success: true,
      data: tokens,
    });
  });

  /**
   * POST /logout
   * Revoca el refresh token, cerrando la sesión.
   */
  app.post("/logout", async (request, reply) => {
    const parsed = refreshTokenSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new ValidationError("Refresh token requerido");
    }

    await authService.logout(parsed.data.refreshToken);

    return reply.send({
      success: true,
      message: "Sesión cerrada exitosamente",
    });
  });

  /**
   * GET /me
   * Retorna el perfil del usuario autenticado con datos del tenant.
   * Requiere token de acceso válido.
   */
  app.get(
    "/me",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const profile = await authService.getProfile(
        request.user.sub,
        request.user.tenantId
      );

      return reply.send({
        success: true,
        data: profile,
      });
    }
  );
}
