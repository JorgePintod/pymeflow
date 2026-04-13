/**
 * Clases de error personalizadas para PymeFlow.
 * Permite manejar errores de forma tipada y consistente en toda la aplicación.
 * Cada error tiene un código HTTP, un código interno y datos opcionales.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly data?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** Error 401 — Credenciales inválidas o sesión expirada */
export class UnauthorizedError extends AppError {
  constructor(message: string = "No autorizado") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

/** Error 403 — Sin permisos para este recurso */
export class ForbiddenError extends AppError {
  constructor(message: string = "Acceso denegado") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

/** Error 404 — Recurso no existe o no pertenece al tenant */
export class NotFoundError extends AppError {
  constructor(resource: string = "Recurso") {
    super(`${resource} no encontrado`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/** Error 400 — Datos inválidos en la solicitud */
export class ValidationError extends AppError {
  constructor(
    message: string,
    data?: Record<string, unknown>
  ) {
    super(message, 400, "VALIDATION_ERROR", data);
    this.name = "ValidationError";
  }
}

/** Error 409 — Conflicto de unicidad (ej: RUT duplicado) */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

/** Error 502 — Fallo en comunicación con el SII */
export class SiiError extends AppError {
  constructor(
    message: string,
    data?: Record<string, unknown>
  ) {
    super(message, 502, "SII_ERROR", data);
    this.name = "SiiError";
  }
}

/** Error 403 — Límite del plan alcanzado */
export class PlanLimitError extends AppError {
  constructor(
    message: string = "Has alcanzado el límite de tu plan. Actualiza para continuar."
  ) {
    super(message, 403, "PLAN_LIMIT_EXCEEDED");
    this.name = "PlanLimitError";
  }
}
