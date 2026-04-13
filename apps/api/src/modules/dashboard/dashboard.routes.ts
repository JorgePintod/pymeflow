import type { FastifyInstance } from "fastify";
import { db } from "../../config/database.js";
import { authenticate } from "../auth/auth.middleware.js";

/**
 * Rutas del dashboard de métricas.
 * Prefijo: /api/v1/dashboard
 *
 * GET /metrics — Métricas principales del tenant
 */
export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/metrics", async (request, reply) => {
    const { tenantId } = request.user;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Ejecutar queries en paralelo
    const [
      invoiceTotals,
      monthlyInvoices,
      overdueInvoices,
      recentInvoices,
      clientCount,
      topClients,
    ] = await Promise.all([
      // Totales globales
      db.invoice.aggregate({
        where: { tenantId, status: { notIn: ["DRAFT", "CANCELLED"] } },
        _sum: { totalAmount: true },
        _count: true,
      }),

      // Facturas de este mes
      db.invoice.aggregate({
        where: {
          tenantId,
          status: { notIn: ["DRAFT", "CANCELLED"] },
          issueDate: { gte: startOfMonth },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),

      // Facturas vencidas
      db.invoice.aggregate({
        where: {
          tenantId,
          status: "OVERDUE",
        },
        _sum: { totalAmount: true },
        _count: true,
      }),

      // Últimas 5 facturas
      db.invoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          folio: true,
          status: true,
          totalAmount: true,
          issueDate: true,
          dueDate: true,
          client: { select: { businessName: true, rut: true } },
        },
      }),

      // Total de clientes activos
      db.client.count({ where: { tenantId, isActive: true } }),

      // Top 5 clientes por monto facturado
      db.client.findMany({
        where: { tenantId, isActive: true },
        orderBy: { totalInvoiced: "desc" },
        take: 5,
        select: {
          id: true,
          businessName: true,
          rut: true,
          totalInvoiced: true,
          totalPaid: true,
          overdueAmount: true,
        },
      }),
    ]);

    // Calcular totales pagados
    const paidTotal = await db.invoice.aggregate({
      where: { tenantId, status: "PAID" },
      _sum: { totalAmount: true },
    });

    // Status breakdown
    const statusBreakdown = await db.invoice.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: true,
      _sum: { totalAmount: true },
    });

    const metrics = {
      invoices: {
        total: invoiceTotals._count,
        totalAmount: Math.round(invoiceTotals._sum.totalAmount ?? 0),
        monthlyCount: monthlyInvoices._count,
        monthlyAmount: Math.round(monthlyInvoices._sum.totalAmount ?? 0),
        overdueCount: overdueInvoices._count,
        overdueAmount: Math.round(overdueInvoices._sum.totalAmount ?? 0),
        paidAmount: Math.round(paidTotal._sum.totalAmount ?? 0),
      },
      clients: {
        activeCount: clientCount,
        topClients,
      },
      statusBreakdown: statusBreakdown.map((s) => ({
        status: s.status,
        count: s._count,
        amount: Math.round(s._sum.totalAmount ?? 0),
      })),
      recentInvoices,
    };

    return reply.send({ success: true, data: metrics });
  });
}
