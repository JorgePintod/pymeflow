import type { FastifyInstance } from "fastify";
import { ClientsService } from "./clients.service.js";
import {
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
} from "./clients.schema.js";
import { authenticate, authorize } from "../auth/auth.middleware.js";
import { ValidationError } from "../../shared/errors.js";

const clientsService = new ClientsService();

/**
 * Rutas del módulo de clientes.
 * Prefijo: /api/v1/clients
 * Todas las rutas requieren autenticación.
 *
 * GET    /           — Listar clientes (con búsqueda y paginación)
 * GET    /:id        — Obtener cliente por ID
 * POST   /           — Crear nuevo cliente
 * PATCH  /:id        — Actualizar cliente
 * DELETE /:id        — Desactivar cliente (soft delete)
 * POST   /:id/reactivate — Reactivar cliente
 */
export async function clientsRoutes(app: FastifyInstance): Promise<void> {
  // Todas las rutas de clientes requieren autenticación
  app.addHook("preHandler", authenticate);

  /**
   * GET /
   * Lista clientes del tenant con búsqueda opcional y paginación.
   */
  app.get("/", async (request, reply) => {
    const parsed = listClientsQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      throw new ValidationError("Parámetros de consulta inválidos", {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await clientsService.findAll(
      request.user.tenantId,
      parsed.data
    );

    return reply.send({ success: true, ...result });
  });

  /**
   * GET /:id
   * Obtiene un cliente por su ID.
   */
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const client = await clientsService.findById(
      request.user.tenantId,
      request.params.id
    );

    return reply.send({ success: true, data: client });
  });

  /**
   * POST /
   * Crea un nuevo cliente. Requiere rol OWNER, ADMIN u OPERATOR.
   */
  app.post(
    "/",
    { preHandler: [authorize("OWNER", "ADMIN", "OPERATOR")] },
    async (request, reply) => {
      const parsed = createClientSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new ValidationError("Datos del cliente inválidos", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const client = await clientsService.create(
        request.user.tenantId,
        parsed.data
      );

      return reply.status(201).send({ success: true, data: client });
    }
  );

  /**
   * PATCH /:id
   * Actualiza parcialmente un cliente existente.
   */
  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authorize("OWNER", "ADMIN", "OPERATOR")] },
    async (request, reply) => {
      const parsed = updateClientSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new ValidationError("Datos de actualización inválidos", {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const client = await clientsService.update(
        request.user.tenantId,
        request.params.id,
        parsed.data
      );

      return reply.send({ success: true, data: client });
    }
  );

  /**
   * DELETE /:id
   * Desactiva un cliente (soft delete). Solo OWNER y ADMIN.
   */
  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      await clientsService.deactivate(
        request.user.tenantId,
        request.params.id
      );

      return reply.send({ success: true, message: "Cliente desactivado" });
    }
  );

  /**
   * POST /:id/reactivate
   * Reactiva un cliente previamente desactivado.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/reactivate",
    { preHandler: [authorize("OWNER", "ADMIN")] },
    async (request, reply) => {
      await clientsService.reactivate(
        request.user.tenantId,
        request.params.id
      );

      return reply.send({ success: true, message: "Cliente reactivado" });
    }
  );
}
