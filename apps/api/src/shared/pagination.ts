import { z } from "zod";
import { PAGINATION } from "../config/constants.js";

/**
 * Schema Zod reutilizable para parámetros de paginación en queries.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Interfaz de respuesta paginada estándar.
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Calcula el offset para la query de Prisma y genera los metadatos de paginación.
 * @param params - Parámetros de paginación (page, limit)
 * @param total - Total de registros encontrados
 * @returns Objeto con skip, take y metadata de paginación
 */
export function buildPagination(
  params: PaginationParams,
  total: number
): {
  skip: number;
  take: number;
  pagination: PaginatedResponse<never>["pagination"];
} {
  const { page, limit } = params;
  const skip = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit);

  return {
    skip,
    take: limit,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: skip + limit < total,
    },
  };
}
