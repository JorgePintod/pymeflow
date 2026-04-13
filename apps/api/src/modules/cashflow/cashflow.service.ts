import { db } from "../../config/database.js";
import { IVA_RATE } from "../../config/constants.js";
import type { CashflowEntryType } from "@prisma/client";

export interface CashflowProjection {
  date: string; // YYYY-MM-DD
  inflows: number;
  outflows: number;
  netFlow: number;
  cumulativeBalance: number;
  items: CashflowItem[];
}

export interface CashflowItem {
  id: string;
  date: string;
  description: string;
  type: "INCOME" | "EXPENSE" | "PROJECTION";
  amount: number;
  category: string | null;
  isConfirmed: boolean;
  sourceType: string | null;
}

export interface CashflowSummary {
  currentBalance: number;
  projectedBalance30: number;
  projectedBalance60: number;
  projectedBalance90: number;
  pendingIncome: number;
  pendingExpenses: number;
  dailyProjections: CashflowProjection[];
  monthlyProjections: MonthlyProjection[];
  alertLevel: "OK" | "WARNING" | "CRITICAL";
}

export interface MonthlyProjection {
  month: string; // YYYY-MM
  label: string;
  income: number;
  expenses: number;
  net: number;
  cumulative: number;
}

/**
 * Engine de proyecciones de flujo de caja.
 * Combina datos reales (facturas + gastos) con proyecciones a 30/60/90 días.
 */
export class CashflowService {
  /**
   * Genera el resumen completo de flujo de caja con proyecciones.
   */
  async getSummary(tenantId: string): Promise<CashflowSummary> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day30 = new Date(today);
    day30.setDate(day30.getDate() + 30);
    const day60 = new Date(today);
    day60.setDate(day60.getDate() + 60);
    const day90 = new Date(today);
    day90.setDate(day90.getDate() + 90);

    // Obtener datos en paralelo
    const [
      confirmedIncome,
      confirmedExpenses,
      pendingInvoices,
      upcomingExpenses,
      cashflowEntries,
    ] = await Promise.all([
      // Ingresos confirmados (pagos recibidos)
      this.getConfirmedIncome(tenantId),
      // Gastos confirmados (pagados)
      this.getConfirmedExpenses(tenantId),
      // Facturas pendientes de cobro
      this.getPendingInvoices(tenantId, day90),
      // Gastos pendientes
      this.getUpcomingExpenses(tenantId, day90),
      // Entradas manuales de cashflow
      this.getCashflowEntries(tenantId, today, day90),
    ]);

    const currentBalance = confirmedIncome - confirmedExpenses;

    // Construir proyecciones diarias (próximos 90 días)
    const dailyProjections = this.buildDailyProjections(
      today,
      90,
      currentBalance,
      pendingInvoices,
      upcomingExpenses,
      cashflowEntries,
    );

    // Calcular balances proyectados
    const projectedBalance30 = this.getBalanceAtDay(dailyProjections, 30);
    const projectedBalance60 = this.getBalanceAtDay(dailyProjections, 60);
    const projectedBalance90 = this.getBalanceAtDay(dailyProjections, 90);

    const pendingIncome = pendingInvoices.reduce((sum, inv) => sum + inv.remaining, 0);
    const pendingExpenseTotal = upcomingExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Proyecciones mensuales (para gráfico de barras)
    const monthlyProjections = this.buildMonthlyProjections(dailyProjections, today);

    // Nivel de alerta
    const alertLevel = this.calculateAlertLevel(
      currentBalance,
      projectedBalance30,
      confirmedExpenses / 12, // gasto mensual promedio
    );

    return {
      currentBalance: Math.round(currentBalance),
      projectedBalance30: Math.round(projectedBalance30),
      projectedBalance60: Math.round(projectedBalance60),
      projectedBalance90: Math.round(projectedBalance90),
      pendingIncome: Math.round(pendingIncome),
      pendingExpenses: Math.round(pendingExpenseTotal),
      dailyProjections,
      monthlyProjections,
      alertLevel,
    };
  }

  /**
   * Obtiene las entradas del flujo de caja con paginación.
   */
  async getEntries(
    tenantId: string,
    params: { page: number; limit: number; type?: CashflowEntryType },
  ) {
    const where: Record<string, unknown> = { tenantId };
    if (params.type) where.type = params.type;

    const [entries, total] = await Promise.all([
      db.cashflowEntry.findMany({
        where,
        orderBy: { entryDate: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      db.cashflowEntry.count({ where }),
    ]);

    return { entries, total };
  }

  /**
   * Crea una entrada manual de flujo de caja.
   */
  async createEntry(
    tenantId: string,
    data: {
      entryDate: Date;
      description: string;
      type: CashflowEntryType;
      amount: number;
      category?: string;
      isConfirmed?: boolean;
    },
  ) {
    return db.cashflowEntry.create({
      data: {
        tenantId,
        entryDate: data.entryDate,
        description: data.description,
        type: data.type,
        amount: Math.round(data.amount),
        category: data.category ?? null,
        isConfirmed: data.isConfirmed ?? false,
      },
    });
  }

  /**
   * Elimina una entrada manual de flujo de caja.
   */
  async deleteEntry(tenantId: string, entryId: string) {
    return db.cashflowEntry.deleteMany({
      where: { id: entryId, tenantId },
    });
  }

  /**
   * Sincroniza el flujo de caja con datos reales de facturas y gastos.
   * Se llama desde un cron job o manualmente.
   */
  async syncFromTransactions(tenantId: string): Promise<{ synced: number }> {
    // Obtener pagos recientes sin entrada de cashflow
    const recentPayments = await db.payment.findMany({
      where: {
        invoice: { tenantId },
        paidAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      include: { invoice: { select: { internalRef: true, client: { select: { businessName: true } } } } },
    });

    const existingSourceIds = new Set(
      (
        await db.cashflowEntry.findMany({
          where: { tenantId, sourceType: "payment" },
          select: { sourceId: true },
        })
      ).map((e) => e.sourceId),
    );

    let synced = 0;
    for (const pay of recentPayments) {
      if (existingSourceIds.has(pay.id)) continue;
      await db.cashflowEntry.create({
        data: {
          tenantId,
          entryDate: pay.paidAt,
          description: `Pago ${pay.invoice.client.businessName} — ${pay.invoice.internalRef}`,
          type: "INCOME",
          amount: Math.round(pay.amount),
          category: "COBROS",
          isConfirmed: true,
          sourceId: pay.id,
          sourceType: "payment",
        },
      });
      synced++;
    }

    // Sincronizar gastos pagados
    const recentExpenses = await db.expense.findMany({
      where: {
        tenantId,
        paidAt: { not: null },
        issueDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
    });

    const existingExpenseIds = new Set(
      (
        await db.cashflowEntry.findMany({
          where: { tenantId, sourceType: "expense" },
          select: { sourceId: true },
        })
      ).map((e) => e.sourceId),
    );

    for (const exp of recentExpenses) {
      if (existingExpenseIds.has(exp.id)) continue;
      await db.cashflowEntry.create({
        data: {
          tenantId,
          entryDate: exp.paidAt!,
          description: `${exp.description} — ${exp.providerName ?? ""}`,
          type: "EXPENSE",
          amount: Math.round(exp.amount),
          category: exp.category,
          isConfirmed: true,
          sourceId: exp.id,
          sourceType: "expense",
        },
      });
      synced++;
    }

    return { synced };
  }

  // ─── Private helpers ──────────────────────────────────

  private async getConfirmedIncome(tenantId: string): Promise<number> {
    const result = await db.payment.aggregate({
      where: { invoice: { tenantId } },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  private async getConfirmedExpenses(tenantId: string): Promise<number> {
    const result = await db.expense.aggregate({
      where: { tenantId, paidAt: { not: null } },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  private async getPendingInvoices(tenantId: string, until: Date) {
    const invoices = await db.invoice.findMany({
      where: {
        tenantId,
        status: { in: ["ISSUED", "OVERDUE", "PARTIAL", "SENT"] },
        dueDate: { lte: until },
      },
      select: {
        id: true,
        totalAmount: true,
        dueDate: true,
        internalRef: true,
        payments: { select: { amount: true } },
        client: { select: { businessName: true } },
      },
    });

    return invoices.map((inv) => {
      const paid = inv.payments.reduce((sum, p) => sum + p.amount, 0);
      return {
        id: inv.id,
        dueDate: inv.dueDate,
        remaining: inv.totalAmount - paid,
        description: `Cobro ${inv.client.businessName} — ${inv.internalRef ?? ""}`,
      };
    });
  }

  private async getUpcomingExpenses(tenantId: string, until: Date) {
    return db.expense.findMany({
      where: {
        tenantId,
        paidAt: null,
        dueDate: { lte: until },
      },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        description: true,
        providerName: true,
        category: true,
      },
    });
  }

  private async getCashflowEntries(tenantId: string, from: Date, to: Date) {
    return db.cashflowEntry.findMany({
      where: {
        tenantId,
        entryDate: { gte: from, lte: to },
      },
      orderBy: { entryDate: "asc" },
    });
  }

  private buildDailyProjections(
    startDate: Date,
    days: number,
    initialBalance: number,
    pendingInvoices: Array<{ dueDate: Date; remaining: number; description: string }>,
    upcomingExpenses: Array<{ dueDate: Date | null; amount: number; description: string }>,
    entries: Array<{ entryDate: Date; amount: number; type: string; description: string; isConfirmed: boolean }>,
  ): CashflowProjection[] {
    const projections: CashflowProjection[] = [];
    let cumulative = initialBalance;

    for (let d = 0; d < days; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().split("T")[0]!;

      let inflows = 0;
      let outflows = 0;
      const dayItems: CashflowItem[] = [];

      // Incoming from pending invoices
      for (const inv of pendingInvoices) {
        if (inv.dueDate.toISOString().split("T")[0] === dateStr) {
          inflows += inv.remaining;
          dayItems.push({
            id: `inv-${inv.description}`,
            date: dateStr,
            description: inv.description,
            type: "INCOME",
            amount: Math.round(inv.remaining),
            category: "COBROS",
            isConfirmed: false,
            sourceType: "invoice",
          });
        }
      }

      // Outgoing from upcoming expenses
      for (const exp of upcomingExpenses) {
        if (exp.dueDate && exp.dueDate.toISOString().split("T")[0] === dateStr) {
          outflows += exp.amount;
          dayItems.push({
            id: `exp-${exp.description}`,
            date: dateStr,
            description: exp.description,
            type: "EXPENSE",
            amount: Math.round(exp.amount),
            category: null,
            isConfirmed: false,
            sourceType: "expense",
          });
        }
      }

      // Manual entries
      for (const entry of entries) {
        if (entry.entryDate.toISOString().split("T")[0] === dateStr) {
          if (entry.type === "INCOME" || entry.type === "PROJECTION") {
            inflows += entry.amount;
          } else {
            outflows += entry.amount;
          }
          dayItems.push({
            id: `entry-${entry.description}`,
            date: dateStr,
            description: entry.description,
            type: entry.type as "INCOME" | "EXPENSE" | "PROJECTION",
            amount: Math.round(entry.amount),
            category: null,
            isConfirmed: entry.isConfirmed,
            sourceType: "manual",
          });
        }
      }

      const netFlow = inflows - outflows;
      cumulative += netFlow;

      projections.push({
        date: dateStr,
        inflows: Math.round(inflows),
        outflows: Math.round(outflows),
        netFlow: Math.round(netFlow),
        cumulativeBalance: Math.round(cumulative),
        items: dayItems,
      });
    }

    return projections;
  }

  private getBalanceAtDay(projections: CashflowProjection[], day: number): number {
    const idx = Math.min(day - 1, projections.length - 1);
    return projections[idx]?.cumulativeBalance ?? 0;
  }

  private buildMonthlyProjections(
    dailyProjections: CashflowProjection[],
    startDate: Date,
  ): MonthlyProjection[] {
    const monthMap = new Map<string, { income: number; expenses: number }>();

    for (const proj of dailyProjections) {
      const monthKey = proj.date.slice(0, 7); // YYYY-MM
      const existing = monthMap.get(monthKey) ?? { income: 0, expenses: 0 };
      existing.income += proj.inflows;
      existing.expenses += proj.outflows;
      monthMap.set(monthKey, existing);
    }

    const months: MonthlyProjection[] = [];
    let cumulative = dailyProjections[0]?.cumulativeBalance ?? 0;

    // Reset cumulative to the first day's initial value
    cumulative = (dailyProjections[0]?.cumulativeBalance ?? 0) -
      (dailyProjections[0]?.netFlow ?? 0);

    for (const [month, data] of monthMap) {
      const net = data.income - data.expenses;
      cumulative += net;

      const [year, m] = month.split("-");
      const date = new Date(Number(year), Number(m) - 1, 1);
      const label = date.toLocaleDateString("es-CL", { month: "short", year: "numeric" });

      months.push({
        month,
        label,
        income: Math.round(data.income),
        expenses: Math.round(data.expenses),
        net: Math.round(net),
        cumulative: Math.round(cumulative),
      });
    }

    return months;
  }

  private calculateAlertLevel(
    currentBalance: number,
    projected30: number,
    averageMonthlyExpenses: number,
  ): "OK" | "WARNING" | "CRITICAL" {
    // Si el balance actual o proyectado a 30 días es negativo
    if (currentBalance < 0 || projected30 < 0) return "CRITICAL";
    // Si el balance cubre menos de 1 mes de gastos
    if (projected30 < averageMonthlyExpenses) return "WARNING";
    return "OK";
  }
}
