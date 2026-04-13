import { z } from "zod";

/**
 * Schema de validación para crear un nuevo cliente.
 * El RUT es obligatorio y se valida como RUT chileno válido.
 */
export const createClientSchema = z.object({
  rut: z
    .string()
    .min(8, "El RUT debe tener al menos 8 caracteres")
    .max(12)
    .trim(),
  businessName: z
    .string()
    .min(2, "La razón social debe tener al menos 2 caracteres")
    .max(200)
    .trim(),
  tradeName: z.string().max(200).optional(),
  email: z
    .string()
    .email("El email no es válido")
    .max(255)
    .optional(),
  phone: z
    .string()
    .max(20)
    .optional(),
  contactName: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  commune: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  paymentDays: z.coerce.number().int().min(0).max(365).default(30),
  creditLimit: z.coerce.number().min(0).optional(),
});

/** Tipo inferido del DTO de creación de cliente */
export type CreateClientDto = z.infer<typeof createClientSchema>;

/**
 * Schema de validación para actualizar un cliente existente.
 * Todos los campos son opcionales (parcial update).
 */
export const updateClientSchema = createClientSchema.partial().omit({ rut: true });

/** Tipo inferido del DTO de actualización de cliente */
export type UpdateClientDto = z.infer<typeof updateClientSchema>;

/**
 * Schema de filtros para listar clientes.
 */
export const listClientsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Tipo inferido de los filtros de listado */
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
