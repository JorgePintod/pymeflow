import { describe, it, expect } from "vitest";
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesQuerySchema,
  registerPaymentSchema,
} from "../../src/modules/invoices/invoices.schema.js";

describe("invoices.schema", () => {
  // ─── createInvoiceSchema ──────────────────────────────

  describe("createInvoiceSchema", () => {
    const validData = {
      clientId: "cuid-abc123",
      documentType: "FACTURA_ELECTRONICA",
      creditDays: 30,
      items: [
        {
          description: "Servicio de consultoría",
          quantity: 10,
          unitPrice: 50000,
        },
      ],
    };

    it("debe aceptar datos válidos mínimos", () => {
      const result = createInvoiceSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("debe aceptar múltiples ítems con todos los campos", () => {
      const result = createInvoiceSchema.safeParse({
        ...validData,
        notes: "Nota de prueba",
        items: [
          {
            code: "SRV-01",
            description: "Servicio A",
            quantity: 5,
            unit: "HR",
            unitPrice: 30000,
            discount: 5000,
            isExempt: false,
          },
          {
            description: "Servicio B",
            quantity: 1,
            unitPrice: 100000,
          },
        ],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(2);
        expect(result.data.items[0].unit).toBe("HR");
        expect(result.data.items[1].unit).toBe("UN"); // default
      }
    });

    it("debe rechazar sin clientId", () => {
      const { clientId, ...rest } = validData;
      const result = createInvoiceSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("debe rechazar sin ítems", () => {
      const result = createInvoiceSchema.safeParse({
        ...validData,
        items: [],
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar ítem sin descripción", () => {
      const result = createInvoiceSchema.safeParse({
        ...validData,
        items: [{ quantity: 1, unitPrice: 1000 }],
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar ítem con precio negativo", () => {
      const result = createInvoiceSchema.safeParse({
        ...validData,
        items: [{ description: "Test", quantity: 1, unitPrice: -500 }],
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar tipo de documento inválido", () => {
      const result = createInvoiceSchema.safeParse({
        ...validData,
        documentType: "RECIBO",
      });
      expect(result.success).toBe(false);
    });

    it("debe usar FACTURA_ELECTRONICA como default", () => {
      const { documentType, ...rest } = validData;
      const result = createInvoiceSchema.safeParse(rest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.documentType).toBe("FACTURA_ELECTRONICA");
      }
    });

    it("debe coerce creditDays a número", () => {
      const result = createInvoiceSchema.safeParse({
        ...validData,
        creditDays: "60",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.creditDays).toBe(60);
      }
    });

    it("debe rechazar creditDays > 365", () => {
      const result = createInvoiceSchema.safeParse({
        ...validData,
        creditDays: 400,
      });
      expect(result.success).toBe(false);
    });

    it("debe aceptar FACTURA_EXENTA", () => {
      const result = createInvoiceSchema.safeParse({
        ...validData,
        documentType: "FACTURA_EXENTA",
      });
      expect(result.success).toBe(true);
    });
  });

  // ─── updateInvoiceSchema ──────────────────────────────

  describe("updateInvoiceSchema", () => {
    it("debe aceptar actualización parcial (solo notes)", () => {
      const result = updateInvoiceSchema.safeParse({ notes: "Actualización" });
      expect(result.success).toBe(true);
    });

    it("debe aceptar objeto vacío", () => {
      const result = updateInvoiceSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("debe rechazar documentType inválido", () => {
      const result = updateInvoiceSchema.safeParse({
        documentType: "INVALIDO",
      });
      expect(result.success).toBe(false);
    });
  });

  // ─── listInvoicesQuerySchema ──────────────────────────

  describe("listInvoicesQuerySchema", () => {
    it("debe aceptar filtros vacíos con defaults", () => {
      const result = listInvoicesQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it("debe aceptar todos los filtros válidos", () => {
      const result = listInvoicesQuerySchema.safeParse({
        search: "consultoría",
        status: "ISSUED",
        clientId: "abc123",
        dateFrom: "2024-01-01",
        dateTo: "2024-12-31",
        page: "2",
        limit: "50",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(50);
        expect(result.data.status).toBe("ISSUED");
      }
    });

    it("debe rechazar status inválido", () => {
      const result = listInvoicesQuerySchema.safeParse({
        status: "INVALID",
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar limit > 100", () => {
      const result = listInvoicesQuerySchema.safeParse({ limit: 200 });
      expect(result.success).toBe(false);
    });

    it("debe rechazar page < 1", () => {
      const result = listInvoicesQuerySchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });
  });

  // ─── registerPaymentSchema ────────────────────────────

  describe("registerPaymentSchema", () => {
    it("debe aceptar pago válido mínimo", () => {
      const result = registerPaymentSchema.safeParse({ amount: 100000 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.paymentMethod).toBe("TRANSFER");
      }
    });

    it("debe aceptar pago con todos los campos", () => {
      const result = registerPaymentSchema.safeParse({
        amount: 500000,
        paidAt: "2024-06-15",
        paymentMethod: "CHECK",
        reference: "CHQ-123",
        notes: "Pago parcial",
      });
      expect(result.success).toBe(true);
    });

    it("debe rechazar monto 0", () => {
      const result = registerPaymentSchema.safeParse({ amount: 0 });
      expect(result.success).toBe(false);
    });

    it("debe rechazar monto negativo", () => {
      const result = registerPaymentSchema.safeParse({ amount: -1000 });
      expect(result.success).toBe(false);
    });

    it("debe rechazar método de pago inválido", () => {
      const result = registerPaymentSchema.safeParse({
        amount: 10000,
        paymentMethod: "BITCOIN",
      });
      expect(result.success).toBe(false);
    });

    it("debe coerce amount string a número", () => {
      const result = registerPaymentSchema.safeParse({ amount: "250000" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(250000);
      }
    });
  });
});
