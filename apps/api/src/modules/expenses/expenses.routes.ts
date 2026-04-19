import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, authorize } from "../auth/auth.middleware.js";
import { ExpenseService } from "./expenses.service.js";
import { paginationSchema } from "../../shared/pagination.js";

const expenseService = new ExpenseService();

const EXPENSE_CATEGORIES = [
  "REMUNERACIONES", "ARRIENDO", "SERVICIOS_BASICOS", "MATERIALES",
  "TRANSPORTE", "MARKETING", "SOFTWARE", "CONTABILIDAD", "OTROS",
] as const;

const createExpenseSchema = z.object({
  description: z.string().min(1).max(200),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  netAmount: z.number().positive().optional(),
  ivaAmount: z.number().min(0).optional(),
  issueDate: z.string().transform((s) => new Date(s)),
  dueDate: z.string().transform((s) => new Date(s)).optional(),
  providerRut: z.string().max(15).optional(),
  providerName: z.string().max(100).optional(),
  documentType: z.string().max(50).optional(),
  folio: z.string().max(50).optional(),
});

const updateExpenseSchema = createExpenseSchema.partial().extend({
  paidAt: z.string().transform((s) => new Date(s)).nullable().optional(),
});

/**
 * Rutas CRUD de gastos con cálculo de crédito fiscal IVA.
 */
export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  // Listar gastos
  app.get("/", async (request) => {
    const query = request.query as Record<string, string>;
    const params = paginationSchema.parse(query);

    const filters = {
      category: query.category as any,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      isPaid: query.isPaid === "true" ? true : query.isPaid === "false" ? false : undefined,
      search: query.search,
    };

    const { expenses, pagination } = await expenseService.list(
      request.user.tenantId,
      params,
      filters,
    );

    return { success: true, data: expenses, pagination };
  });

  // Resumen de gastos e IVA
  app.get("/summary", async (request) => {
    const query = request.query as Record<string, string>;
    const summary = await expenseService.getSummary(request.user.tenantId, query.month);
    return { success: true, data: summary };
  });

  // Obtener gasto por ID
  app.get("/:id", async (request) => {
    const { id } = request.params as { id: string };
    const expense = await expenseService.getById(request.user.tenantId, id);
    return { success: true, data: expense };
  });

  // Crear gasto
  app.post("/", async (request, reply) => {
    const data = createExpenseSchema.parse(request.body);
    const expense = await expenseService.create(request.user.tenantId, data as any);
    return reply.status(201).send({ success: true, data: expense });
  });

  // Actualizar gasto
  app.patch("/:id", async (request) => {
    const { id } = request.params as { id: string };
    const data = updateExpenseSchema.parse(request.body);
    const expense = await expenseService.update(request.user.tenantId, id, data as any);
    return { success: true, data: expense };
  });

  // Eliminar gasto
  app.delete("/:id", { preHandler: [authenticate, authorize("OWNER", "ADMIN")] }, async (request) => {
    const { id } = request.params as { id: string };
    await expenseService.delete(request.user.tenantId, id);
    return { success: true };
  });

  // Marcar como pagado
  app.post("/:id/pay", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { paidAt?: string } | undefined;
    const paidAt = body?.paidAt ? new Date(body.paidAt) : undefined;
    const expense = await expenseService.markPaid(request.user.tenantId, id, paidAt);
    return { success: true, data: expense };
  });
}
