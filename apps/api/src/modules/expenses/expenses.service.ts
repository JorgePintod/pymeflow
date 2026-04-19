import { db } from "../../config/database.js";
import { IVA_RATE } from "../../config/constants.js";
import { NotFoundError } from "../../shared/errors.js";
import { buildPagination, type PaginationParams } from "../../shared/pagination.js";
import type { ExpenseCategory } from "@prisma/client";

export interface CreateExpenseData {
  description: string;
  category: ExpenseCategory;
  amount: number;
  netAmount?: number;
  ivaAmount?: number;
  issueDate: Date;
  dueDate?: Date;
  providerRut?: string;
  providerName?: string;
  documentType?: string;
  folio?: string;
}

export interface UpdateExpenseData extends Partial<CreateExpenseData> {
  paidAt?: Date | null;
}

export interface ExpenseFilters {
  category?: ExpenseCategory;
  dateFrom?: Date;
  dateTo?: Date;
  isPaid?: boolean;
  search?: string;
}

export interface ExpenseSummary {
  totalExpenses: number;
  totalIvaCredito: number;
  monthlyExpenses: number;
  monthlyIvaCredito: number;
  monthlyIvaDebito: number;
  monthlyIvaPagar: number;
  month: string; // "YYYY-MM"
  byCategory: Array<{ category: string; total: number; count: number }>;
}

/**
 * Servicio de gestión de gastos con cálculo automático de crédito fiscal IVA.
 */
export class ExpenseService {
  /**
   * Lista gastos con paginación y filtros.
   */
  async list(
    tenantId: string,
    params: PaginationParams,
    filters: ExpenseFilters = {},
  ) {
    const where = this.buildWhere(tenantId, filters);

    const [expenses, total] = await Promise.all([
      db.expense.findMany({
        where,
        orderBy: { issueDate: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      db.expense.count({ where }),
    ]);

    const { pagination } = buildPagination(params, total);
    return { expenses, pagination };
  }

  /**
   * Obtiene un gasto por ID.
   */
  async getById(tenantId: string, id: string) {
    const expense = await db.expense.findFirst({
      where: { id, tenantId },
    });
    if (!expense) throw new NotFoundError("Gasto no encontrado");
    return expense;
  }

  /**
   * Crea un nuevo gasto con cálculo automático de IVA si no se provee.
   */
  async create(tenantId: string, data: CreateExpenseData) {
    // Si no se proporcionan montos separados, calcular desde el total
    let netAmount = data.netAmount;
    let ivaAmount = data.ivaAmount;

    if (netAmount == null && ivaAmount == null) {
      // Asumimos que el monto incluye IVA
      netAmount = Math.round(data.amount / (1 + IVA_RATE));
      ivaAmount = Math.round(data.amount - netAmount);
    } else if (netAmount != null && ivaAmount == null) {
      ivaAmount = Math.round(netAmount * IVA_RATE);
    } else if (netAmount == null && ivaAmount != null) {
      netAmount = Math.round(data.amount - ivaAmount);
    }

    return db.expense.create({
      data: {
        tenantId,
        description: data.description,
        category: data.category,
        amount: Math.round(data.amount),
        netAmount: netAmount ? Math.round(netAmount) : null,
        ivaAmount: ivaAmount ? Math.round(ivaAmount) : null,
        issueDate: data.issueDate,
        dueDate: data.dueDate ?? null,
        providerRut: data.providerRut ?? null,
        providerName: data.providerName ?? null,
        documentType: data.documentType ?? null,
        folio: data.folio ?? null,
      },
    });
  }

  /**
   * Actualiza un gasto existente.
   */
  async update(tenantId: string, id: string, data: UpdateExpenseData) {
    // Verificar que existe
    await this.getById(tenantId, id);

    const updateData: Record<string, unknown> = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.amount !== undefined) updateData.amount = Math.round(data.amount);
    if (data.netAmount !== undefined) updateData.netAmount = data.netAmount ? Math.round(data.netAmount) : null;
    if (data.ivaAmount !== undefined) updateData.ivaAmount = data.ivaAmount ? Math.round(data.ivaAmount) : null;
    if (data.issueDate !== undefined) updateData.issueDate = data.issueDate;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate;
    if (data.paidAt !== undefined) updateData.paidAt = data.paidAt;
    if (data.providerRut !== undefined) updateData.providerRut = data.providerRut;
    if (data.providerName !== undefined) updateData.providerName = data.providerName;
    if (data.documentType !== undefined) updateData.documentType = data.documentType;
    if (data.folio !== undefined) updateData.folio = data.folio;

    return db.expense.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Elimina un gasto.
   */
  async delete(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    return db.expense.delete({ where: { id } });
  }

  /**
   * Marca un gasto como pagado.
   */
  async markPaid(tenantId: string, id: string, paidAt?: Date) {
    await this.getById(tenantId, id);
    return db.expense.update({
      where: { id },
      data: { paidAt: paidAt ?? new Date() },
    });
  }

  /**
   * Resumen de gastos y crédito fiscal IVA para el F29.
   * @param month - Opcional: "YYYY-MM" para filtrar. Default: mes actual.
   */
  async getSummary(tenantId: string, month?: string): Promise<ExpenseSummary> {
    let monthStart: Date;
    let monthEnd: Date;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const parts = month.split("-");
      const year = parseInt(parts[0]!, 10);
      const mon = parseInt(parts[1]!, 10);
      monthStart = new Date(year, mon - 1, 1);
      monthEnd = new Date(year, mon, 1);
    } else {
      const now = new Date();
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    const selectedMonth = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;

    const [totalAgg, monthlyAgg, byCategory, invoiceIvaAgg] = await Promise.all([
      db.expense.aggregate({
        where: { tenantId },
        _sum: { amount: true, ivaAmount: true },
      }),
      db.expense.aggregate({
        where: { tenantId, issueDate: { gte: monthStart, lt: monthEnd } },
        _sum: { amount: true, ivaAmount: true },
      }),
      db.expense.groupBy({
        by: ["category"],
        where: { tenantId },
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
      // IVA Débito: IVA cobrado en facturas emitidas (no borradores ni canceladas)
      db.invoice.aggregate({
        where: {
          tenantId,
          issueDate: { gte: monthStart, lt: monthEnd },
          status: { notIn: ["DRAFT", "CANCELLED"] },
        },
        _sum: { ivaAmount: true },
      }),
    ]);

    const monthlyIvaCredito = Math.round(monthlyAgg._sum.ivaAmount ?? 0);
    const monthlyIvaDebito = Math.round(invoiceIvaAgg._sum.ivaAmount ?? 0);

    return {
      totalExpenses: Math.round(totalAgg._sum.amount ?? 0),
      totalIvaCredito: Math.round(totalAgg._sum.ivaAmount ?? 0),
      monthlyExpenses: Math.round(monthlyAgg._sum.amount ?? 0),
      monthlyIvaCredito,
      monthlyIvaDebito,
      monthlyIvaPagar: Math.max(0, monthlyIvaDebito - monthlyIvaCredito),
      month: selectedMonth,
      byCategory: byCategory.map((c) => ({
        category: c.category,
        total: Math.round(c._sum.amount ?? 0),
        count: c._count.id,
      })),
    };
  }

  private buildWhere(tenantId: string, filters: ExpenseFilters) {
    const where: Record<string, unknown> = { tenantId };

    if (filters.category) where.category = filters.category;
    if (filters.isPaid === true) where.paidAt = { not: null };
    if (filters.isPaid === false) where.paidAt = null;

    if (filters.dateFrom || filters.dateTo) {
      where.issueDate = {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lte: filters.dateTo }),
      };
    }

    if (filters.search) {
      where.OR = [
        { description: { contains: filters.search, mode: "insensitive" } },
        { providerName: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    return where;
  }
}
