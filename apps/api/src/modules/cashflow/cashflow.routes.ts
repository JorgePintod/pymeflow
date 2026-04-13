import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/auth.middleware.js";
import { CashflowService } from "./cashflow.service.js";
import { paginationSchema, buildPagination } from "../../shared/pagination.js";

const cashflowService = new CashflowService();

const createEntrySchema = z.object({
  entryDate: z.string().transform((s) => new Date(s)),
  description: z.string().min(1).max(200),
  type: z.enum(["INCOME", "EXPENSE", "PROJECTION"]),
  amount: z.number().positive(),
  category: z.string().max(50).optional(),
  isConfirmed: z.boolean().optional(),
});

/**
 * Rutas del módulo de flujo de caja.
 */
export async function cashflowRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // Resumen con proyecciones 30/60/90 días
  app.get("/summary", async (request) => {
    const summary = await cashflowService.getSummary(request.user.tenantId);
    return { success: true, data: summary };
  });

  // Listar entradas de cashflow
  app.get("/entries", async (request) => {
    const query = request.query as Record<string, string>;
    const params = paginationSchema.parse(query);
    const type = query.type as "INCOME" | "EXPENSE" | "PROJECTION" | undefined;

    const { entries, total } = await cashflowService.getEntries(
      request.user.tenantId,
      { ...params, type: type as any },
    );

    const { pagination } = buildPagination(params, total);
    return { success: true, data: entries, pagination };
  });

  // Crear entrada manual
  app.post("/entries", async (request, reply) => {
    const data = createEntrySchema.parse(request.body);
    const entry = await cashflowService.createEntry(request.user.tenantId, data);
    return reply.status(201).send({ success: true, data: entry });
  });

  // Eliminar entrada
  app.delete("/entries/:id", async (request) => {
    const { id } = request.params as { id: string };
    await cashflowService.deleteEntry(request.user.tenantId, id);
    return { success: true };
  });

  // Sincronizar desde transacciones reales
  app.post("/sync", async (request) => {
    const result = await cashflowService.syncFromTransactions(request.user.tenantId);
    return { success: true, data: result };
  });
}
