import { db } from "../../config/database.js";
import { IVA_RATE, PLAN_LIMITS, SII_DOCUMENT_TYPES } from "../../config/constants.js";
import {
  NotFoundError,
  ValidationError,
  PlanLimitError,
} from "../../shared/errors.js";
import { calculateIva, calculateDueDate } from "../../shared/chile.utils.js";
import { buildPagination } from "../../shared/pagination.js";
import type {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  ListInvoicesQuery,
  RegisterPaymentDto,
} from "./invoices.schema.js";
import type { Plan } from "@prisma/client";

export class InvoicesService {
  // ─── Crear factura ─────────────────────────────────────

  async create(tenantId: string, dto: CreateInvoiceDto) {
    // Verificar límite del plan
    await this.checkPlanLimit(tenantId);

    // Verificar que el cliente pertenece al tenant
    const client = await db.client.findFirst({
      where: { id: dto.clientId, tenantId, isActive: true },
    });
    if (!client) {
      throw new NotFoundError("Cliente");
    }

    // Calcular montos de cada ítem y totales
    const isExempt = dto.documentType === "FACTURA_EXENTA";
    const itemsWithTotals = dto.items.map((item, index) => {
      const lineTotal = Math.round(item.quantity * item.unitPrice - item.discount);
      return {
        lineNumber: index + 1,
        code: item.code,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: Math.round(item.unitPrice),
        discount: Math.round(item.discount),
        lineTotal,
        isExempt: isExempt || item.isExempt,
      };
    });

    // Calcular neto, IVA y total
    const exemptTotal = itemsWithTotals
      .filter((i) => i.isExempt)
      .reduce((sum, i) => sum + i.lineTotal, 0);
    const taxableTotal = itemsWithTotals
      .filter((i) => !i.isExempt)
      .reduce((sum, i) => sum + i.lineTotal, 0);

    const netAmount = Math.round(taxableTotal + exemptTotal);
    const { ivaAmount, totalAmount } = isExempt
      ? { ivaAmount: 0, totalAmount: netAmount }
      : calculateIva(taxableTotal, IVA_RATE);
    const finalTotal = isExempt ? netAmount : totalAmount + exemptTotal;

    // Determinar fecha de vencimiento
    const issueDate = dto.issueDate ?? new Date();
    const creditDays = dto.creditDays ?? client.paymentDays;
    const dueDate = dto.dueDate ?? calculateDueDate(issueDate, creditDays);

    // Crear factura con ítems en una transacción
    const invoice = await db.invoice.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        documentType: dto.documentType,
        netAmount,
        ivaRate: isExempt ? 0 : IVA_RATE,
        ivaAmount: isExempt ? 0 : ivaAmount,
        totalAmount: finalTotal,
        issueDate,
        dueDate,
        notes: dto.notes,
        internalRef: dto.internalRef,
        items: {
          create: itemsWithTotals,
        },
      },
      include: {
        items: { orderBy: { lineNumber: "asc" } },
        client: {
          select: {
            id: true,
            rut: true,
            businessName: true,
            tradeName: true,
            email: true,
          },
        },
      },
    });

    return invoice;
  }

  // ─── Listar facturas ──────────────────────────────────

  async findAll(tenantId: string, query: ListInvoicesQuery) {
    const where: Record<string, unknown> = { tenantId };

    if (query.status) where.status = query.status;
    if (query.clientId) where.clientId = query.clientId;
    if (query.dateFrom || query.dateTo) {
      where.issueDate = {
        ...(query.dateFrom && { gte: query.dateFrom }),
        ...(query.dateTo && { lte: query.dateTo }),
      };
    }
    if (query.search) {
      where.OR = [
        { internalRef: { contains: query.search, mode: "insensitive" } },
        { notes: { contains: query.search, mode: "insensitive" } },
        { client: { businessName: { contains: query.search, mode: "insensitive" } } },
        { client: { rut: { contains: query.search } } },
      ];
    }

    const total = await db.invoice.count({ where });
    const { skip, take, pagination } = buildPagination(
      { page: query.page, limit: query.limit },
      total,
    );

    const invoices = await db.invoice.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentType: true,
        folio: true,
        status: true,
        siiStatus: true,
        netAmount: true,
        ivaAmount: true,
        totalAmount: true,
        issueDate: true,
        dueDate: true,
        paidAt: true,
        internalRef: true,
        createdAt: true,
        client: {
          select: {
            id: true,
            rut: true,
            businessName: true,
          },
        },
      },
    });

    return { data: invoices, pagination };
  }

  // ─── Obtener factura por ID ───────────────────────────

  async findById(tenantId: string, invoiceId: string) {
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        items: { orderBy: { lineNumber: "asc" } },
        client: {
          select: {
            id: true,
            rut: true,
            businessName: true,
            tradeName: true,
            email: true,
            phone: true,
            address: true,
            commune: true,
            region: true,
          },
        },
        payments: {
          orderBy: { paidAt: "desc" },
          select: {
            id: true,
            amount: true,
            paidAt: true,
            paymentMethod: true,
            reference: true,
            notes: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError("Factura");
    }

    return invoice;
  }

  // ─── Actualizar factura (solo borrador) ───────────────

  async update(tenantId: string, invoiceId: string, dto: UpdateInvoiceDto) {
    const existing = await db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!existing) {
      throw new NotFoundError("Factura");
    }

    if (existing.status !== "DRAFT") {
      throw new ValidationError(
        "Solo se pueden editar facturas en estado borrador",
      );
    }

    // Si se cambia el cliente, verificar que pertenece al tenant
    if (dto.clientId && dto.clientId !== existing.clientId) {
      const client = await db.client.findFirst({
        where: { id: dto.clientId, tenantId, isActive: true },
      });
      if (!client) throw new NotFoundError("Cliente");
    }

    // Si vienen ítems nuevos, recalcular montos
    if (dto.items) {
      const isExempt =
        (dto.documentType ?? existing.documentType) === "FACTURA_EXENTA";

      const itemsWithTotals = dto.items.map((item, index) => {
        const lineTotal = Math.round(
          item.quantity * item.unitPrice - item.discount,
        );
        return {
          lineNumber: index + 1,
          code: item.code,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: Math.round(item.unitPrice),
          discount: Math.round(item.discount),
          lineTotal,
          isExempt: isExempt || item.isExempt,
        };
      });

      const exemptTotal = itemsWithTotals
        .filter((i) => i.isExempt)
        .reduce((sum, i) => sum + i.lineTotal, 0);
      const taxableTotal = itemsWithTotals
        .filter((i) => !i.isExempt)
        .reduce((sum, i) => sum + i.lineTotal, 0);

      const netAmount = Math.round(taxableTotal + exemptTotal);
      const { ivaAmount, totalAmount } = isExempt
        ? { ivaAmount: 0, totalAmount: netAmount }
        : calculateIva(taxableTotal, IVA_RATE);
      const finalTotal = isExempt ? netAmount : totalAmount + exemptTotal;

      const issueDate = dto.issueDate ?? existing.issueDate;
      const dueDate = dto.dueDate ??
        (dto.creditDays !== undefined
          ? calculateDueDate(issueDate, dto.creditDays)
          : existing.dueDate);

      // Transacción: borrar ítems viejos, actualizar factura + crear nuevos
      const invoice = await db.$transaction(async (tx) => {
        await tx.invoiceItem.deleteMany({ where: { invoiceId } });

        return tx.invoice.update({
          where: { id: invoiceId },
          data: {
            clientId: dto.clientId,
            documentType: dto.documentType,
            netAmount,
            ivaRate: isExempt ? 0 : IVA_RATE,
            ivaAmount: isExempt ? 0 : ivaAmount,
            totalAmount: finalTotal,
            issueDate,
            dueDate,
            notes: dto.notes,
            internalRef: dto.internalRef,
            items: { create: itemsWithTotals },
          },
          include: {
            items: { orderBy: { lineNumber: "asc" } },
            client: {
              select: {
                id: true,
                rut: true,
                businessName: true,
              },
            },
          },
        });
      });

      return invoice;
    }

    // Update sin cambio de ítems (solo metadatos)
    const issueDate = dto.issueDate ?? existing.issueDate;
    const dueDate = dto.dueDate ??
      (dto.creditDays !== undefined
        ? calculateDueDate(issueDate, dto.creditDays)
        : existing.dueDate);

    const invoice = await db.invoice.update({
      where: { id: invoiceId },
      data: {
        clientId: dto.clientId,
        documentType: dto.documentType,
        issueDate: dto.issueDate,
        dueDate,
        notes: dto.notes,
        internalRef: dto.internalRef,
      },
      include: {
        items: { orderBy: { lineNumber: "asc" } },
        client: {
          select: { id: true, rut: true, businessName: true },
        },
      },
    });

    return invoice;
  }

  // ─── Emitir factura (cambiar de DRAFT a ISSUED) ──────

  async issue(tenantId: string, invoiceId: string) {
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { items: true, client: true },
    });

    if (!invoice) throw new NotFoundError("Factura");

    if (invoice.status !== "DRAFT") {
      throw new ValidationError("Solo se pueden emitir facturas en estado borrador");
    }

    if (invoice.items.length === 0) {
      throw new ValidationError("La factura debe tener al menos un ítem");
    }

    // Asignar folio correlativo dentro del tenant + tipo de documento
    const lastInvoice = await db.invoice.findFirst({
      where: {
        tenantId,
        documentType: invoice.documentType,
        folio: { not: null },
      },
      orderBy: { folio: "desc" },
      select: { folio: true },
    });

    const nextFolio = (lastInvoice?.folio ?? 0) + 1;

    const issued = await db.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "ISSUED",
        siiStatus: "PENDING",
        folio: nextFolio,
        issueDate: new Date(),
      },
      include: {
        items: { orderBy: { lineNumber: "asc" } },
        client: {
          select: { id: true, rut: true, businessName: true, email: true },
        },
      },
    });

    // Actualizar el total facturado del cliente
    await db.client.update({
      where: { id: invoice.clientId },
      data: { totalInvoiced: { increment: invoice.totalAmount } },
    });

    return issued;
  }

  // ─── Cancelar factura ─────────────────────────────────

  async cancel(tenantId: string, invoiceId: string) {
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!invoice) throw new NotFoundError("Factura");

    if (invoice.status === "CANCELLED") {
      throw new ValidationError("La factura ya está cancelada");
    }

    if (invoice.status === "PAID") {
      throw new ValidationError("No se puede cancelar una factura pagada");
    }

    const cancelled = await db.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "CANCELLED",
        siiStatus: "CANCELLED",
      },
    });

    // Revertir total facturado si ya estaba emitida
    if (invoice.status !== "DRAFT") {
      await db.client.update({
        where: { id: invoice.clientId },
        data: { totalInvoiced: { decrement: invoice.totalAmount } },
      });
    }

    return cancelled;
  }

  // ─── Registrar pago ───────────────────────────────────

  async registerPayment(
    tenantId: string,
    invoiceId: string,
    dto: RegisterPaymentDto,
  ) {
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        payments: { select: { amount: true } },
      },
    });

    if (!invoice) throw new NotFoundError("Factura");

    if (invoice.status === "DRAFT") {
      throw new ValidationError("No se puede pagar una factura en borrador. Emítela primero.");
    }

    if (invoice.status === "CANCELLED") {
      throw new ValidationError("No se puede pagar una factura cancelada");
    }

    if (invoice.status === "PAID") {
      throw new ValidationError("La factura ya está completamente pagada");
    }

    const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.round(invoice.totalAmount - totalPaid);

    if (dto.amount > remaining) {
      throw new ValidationError(
        `El monto excede el saldo pendiente. Máximo: $${remaining.toLocaleString("es-CL")}`,
      );
    }

    const paidAt = dto.paidAt ?? new Date();
    const isFullyPaid = dto.amount >= remaining;

    // Transacción: crear pago + actualizar factura + actualizar cliente
    const payment = await db.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          invoiceId,
          tenantId,
          amount: dto.amount,
          paidAt,
          paymentMethod: dto.paymentMethod,
          reference: dto.reference,
          notes: dto.notes,
        },
      });

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: isFullyPaid ? "PAID" : "PARTIAL",
          paidAt: isFullyPaid ? paidAt : undefined,
        },
      });

      await tx.client.update({
        where: { id: invoice.clientId },
        data: { totalPaid: { increment: dto.amount } },
      });

      return p;
    });

    return {
      payment,
      invoiceStatus: isFullyPaid ? "PAID" : "PARTIAL",
      totalPaid: totalPaid + dto.amount,
      remaining: remaining - dto.amount,
    };
  }

  // ─── Verificar límite del plan ────────────────────────

  private async checkPlanLimit(tenantId: string) {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });

    if (!tenant) throw new NotFoundError("Tenant");

    const limit = PLAN_LIMITS[tenant.plan as keyof typeof PLAN_LIMITS];
    if (limit === Infinity) return;

    // Contar facturas emitidas este mes
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const count = await db.invoice.count({
      where: {
        tenantId,
        status: { not: "DRAFT" },
        createdAt: { gte: startOfMonth },
      },
    });

    if (count >= limit) {
      throw new PlanLimitError(
        `Has alcanzado el límite de ${limit} documentos para tu plan. Actualiza para continuar.`,
      );
    }
  }
}
