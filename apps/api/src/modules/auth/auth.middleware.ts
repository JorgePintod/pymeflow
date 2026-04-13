import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { UnauthorizedError, ForbiddenError } from "../../shared/errors.js";
import type { UserRole } from "@prisma/client";

/**
 * Payload decodificado del JWT de acceso.
 * Se adjunta a request.user en cada solicitud autenticada.
 */
export interface JwtPayload {
  sub: string;        // userId
  tenantId: string;
  role: UserRole;
  type: "access" | "refresh";
  iat: number;
  exp: number;
}

// Extender el tipo de FastifyRequest para incluir el usuario autenticado
declare module "fastify" {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

/**
 * Middleware de autenticación JWT.
 * Verifica el token del header Authorization y adjunta el payload a request.user.
 * Se registra como preHandler en las rutas protegidas.
 *
 * @throws UnauthorizedError si el token no existe, es inválido o ha expirado
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Token de acceso requerido");
  }

  const token = authHeader.slice(7); // Remover "Bearer "

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    if (payload.type !== "access") {
      throw new UnauthorizedError("Tipo de token inválido");
    }

    request.user = payload;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Token expirado. Renueva tu sesión.");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError("Token inválido");
    }
    throw new UnauthorizedError("Error al verificar token");
  }
}

/**
 * Factory de middleware de autorización por rol.
 * Verifica que el usuario autenticado tenga uno de los roles permitidos.
 *
 * @param allowedRoles - Roles que tienen acceso al recurso
 * @returns Middleware de Fastify que valida el rol
 *
 * @example
 *   // Solo OWNER y ADMIN pueden acceder
 *   { preHandler: [authenticate, authorize("OWNER", "ADMIN")] }
 */
export function authorize(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError("Debe autenticarse primero");
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError(
        `Se requiere uno de los siguientes roles: ${allowedRoles.join(", ")}`
      );
    }
  };
}
