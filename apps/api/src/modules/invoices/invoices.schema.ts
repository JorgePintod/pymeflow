import { z } from "zod";

// ─── Schemas de ítems de factura ───────────────────────

const invoiceItemSchema = z.object({
  code: z.string().max(50).optional(),
  description: z.string().min(1, "La descripción es requerida").max(500),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a 0").default(1),
  unit: z.string().max(10).default("UN"),
  unitPrice: z.coerce.number().int("El precio debe ser entero (CLP)").min(0),
  discount: z.coerce.number().int().min(0).default(0),
  isExempt: z.boolean().default(false),
});

export type InvoiceItemDto = z.infer<typeof invoiceItemSchema>;

// ─── Schema para crear factura ─────────────────────────

export const createInvoiceSchema = z.object({
  clientId: z.string().min(1, "El cliente es requerido"),
  documentType: z
    .enum([
      "FACTURA_ELECTRONICA",
      "BOLETA_ELECTRONICA",
      "NOTA_CREDITO_ELECTRONICA",
      "NOTA_DEBITO_ELECTRONICA",
      "FACTURA_EXENTA",
    ])
    .default("FACTURA_ELECTRONICA"),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
  notes: z.string().max(2000).optional(),
  internalRef: z.string().max(100).optional(),
  items: z
    .array(invoiceItemSchema)
    .min(1, "La factura debe tener al menos un ítem"),
});

export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;

// ─── Schema para actualizar factura (solo borrador) ────

export const updateInvoiceSchema = z.object({
  clientId: z.string().min(1).optional(),
  documentType: z
    .enum([
      "FACTURA_ELECTRONICA",
      "BOLETA_ELECTRONICA",
      "NOTA_CREDITO_ELECTRONICA",
      "NOTA_DEBITO_ELECTRONICA",
      "FACTURA_EXENTA",
    ])
    .optional(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
  notes: z.string().max(2000).optional(),
  internalRef: z.string().max(100).optional(),
  items: z.array(invoiceItemSchema).min(1).optional(),
});

export type UpdateInvoiceDto = z.infer<typeof updateInvoiceSchema>;

// ─── Schema de filtros para listar facturas ────────────

export const listInvoicesQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z
    .enum(["DRAFT", "ISSUED", "SENT", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"])
    .optional(),
  clientId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

// ─── Schema para registrar pago ────────────────────────

export const registerPaymentSchema = z.object({
  amount: z.coerce.number().int("El monto debe ser entero (CLP)").positive("El monto debe ser mayor a 0"),
  paidAt: z.coerce.date().optional(),
  paymentMethod: z
    .enum(["TRANSFER", "CHECK", "CASH", "CARD", "OTHER"])
    .default("TRANSFER"),
  reference: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export type RegisterPaymentDto = z.infer<typeof registerPaymentSchema>;
