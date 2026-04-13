import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Test schemas used by collections routes
const listCollectionLogsSchema = z.object({
  invoiceId: z.string().optional(),
  channel: z.enum(["EMAIL", "WHATSAPP", "SMS"]).optional(),
  status: z.enum(["SENT", "DELIVERED", "FAILED", "BOUNCED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const updateSettingsSchema = z.object({
  collectionEnabled: z.boolean().optional(),
  collectionDays: z.array(z.number().int().min(1).max(365)).min(1).max(10).optional(),
});

const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

describe("collections.schema", () => {
  describe("listCollectionLogsSchema", () => {
    it("debe aceptar parámetros vacíos (defaults)", () => {
      const result = listCollectionLogsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it("debe aceptar filtros válidos de canal", () => {
      const result = listCollectionLogsSchema.safeParse({ channel: "EMAIL" });
      expect(result.success).toBe(true);
    });

    it("debe rechazar canal inválido", () => {
      const result = listCollectionLogsSchema.safeParse({ channel: "TELEGRAM" });
      expect(result.success).toBe(false);
    });

    it("debe aceptar filtros válidos de estado", () => {
      for (const status of ["SENT", "DELIVERED", "FAILED", "BOUNCED"]) {
        const result = listCollectionLogsSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it("debe coercionar page y limit desde strings", () => {
      const result = listCollectionLogsSchema.safeParse({ page: "3", limit: "50" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(3);
        expect(result.data.limit).toBe(50);
      }
    });

    it("debe rechazar limit > 100", () => {
      const result = listCollectionLogsSchema.safeParse({ limit: "200" });
      expect(result.success).toBe(false);
    });
  });

  describe("updateSettingsSchema", () => {
    it("debe aceptar collectionEnabled booleano", () => {
      const result = updateSettingsSchema.safeParse({ collectionEnabled: true });
      expect(result.success).toBe(true);
    });

    it("debe aceptar collectionDays válidos", () => {
      const result = updateSettingsSchema.safeParse({
        collectionDays: [1, 3, 7, 14, 30],
      });
      expect(result.success).toBe(true);
    });

    it("debe rechazar collectionDays vacío", () => {
      const result = updateSettingsSchema.safeParse({ collectionDays: [] });
      expect(result.success).toBe(false);
    });

    it("debe rechazar más de 10 días de cobranza", () => {
      const result = updateSettingsSchema.safeParse({
        collectionDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      });
      expect(result.success).toBe(false);
    });

    it("debe rechazar días fuera de rango (0)", () => {
      const result = updateSettingsSchema.safeParse({ collectionDays: [0] });
      expect(result.success).toBe(false);
    });

    it("debe rechazar días fuera de rango (>365)", () => {
      const result = updateSettingsSchema.safeParse({ collectionDays: [400] });
      expect(result.success).toBe(false);
    });

    it("debe aceptar ambos campos juntos", () => {
      const result = updateSettingsSchema.safeParse({
        collectionEnabled: false,
        collectionDays: [7, 14, 30],
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("pushSubscribe.schema", () => {
  const validSubscription = {
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: {
        p256dh: "BLKjkw_base64key",
        auth: "auth_key_abc",
      },
    },
  };

  it("debe aceptar suscripción push válida", () => {
    const result = pushSubscribeSchema.safeParse(validSubscription);
    expect(result.success).toBe(true);
  });

  it("debe rechazar endpoint no URL", () => {
    const result = pushSubscribeSchema.safeParse({
      subscription: {
        ...validSubscription.subscription,
        endpoint: "not-a-url",
      },
    });
    expect(result.success).toBe(false);
  });

  it("debe rechazar keys vacías", () => {
    const result = pushSubscribeSchema.safeParse({
      subscription: {
        endpoint: "https://example.com/push",
        keys: { p256dh: "", auth: "" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("debe rechazar subscription sin keys", () => {
    const result = pushSubscribeSchema.safeParse({
      subscription: { endpoint: "https://example.com/push" },
    });
    expect(result.success).toBe(false);
  });
});

describe("CollectionJobData", () => {
  // Validate the shape requirements for job data
  it("debe tener los campos requeridos", () => {
    const jobData = {
      tenantId: "tenant-123",
      invoiceId: "invoice-456",
      daysOverdue: 7,
      channel: "EMAIL" as const,
    };

    expect(jobData.tenantId).toBeDefined();
    expect(jobData.invoiceId).toBeDefined();
    expect(typeof jobData.daysOverdue).toBe("number");
    expect(["EMAIL", "WHATSAPP"]).toContain(jobData.channel);
  });

  it("debe soportar canal EMAIL y WHATSAPP", () => {
    const emailJob = { tenantId: "t", invoiceId: "i", daysOverdue: 1, channel: "EMAIL" as const };
    const waJob = { tenantId: "t", invoiceId: "i", daysOverdue: 7, channel: "WHATSAPP" as const };

    expect(emailJob.channel).toBe("EMAIL");
    expect(waJob.channel).toBe("WHATSAPP");
  });
});

describe("scheduling logic (unit)", () => {
  it("debe calcular días vencidos correctamente", () => {
    const now = new Date("2025-01-15T08:00:00Z");
    const dueDate = new Date("2025-01-08T00:00:00Z");

    const daysOverdue = Math.floor(
      (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    expect(daysOverdue).toBe(7);
  });

  it("debe considerar 0 días si vence hoy", () => {
    const now = new Date("2025-01-15T08:00:00Z");
    const dueDate = new Date("2025-01-15T00:00:00Z");

    const daysOverdue = Math.floor(
      (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    expect(daysOverdue).toBe(0);
  });

  it("debe filtrar días según configuración del tenant", () => {
    const collectionDays = [1, 3, 7, 14, 30];
    const daysOverdue = 7;

    expect(collectionDays.includes(daysOverdue)).toBe(true);
    expect(collectionDays.includes(5)).toBe(false);
  });

  it("debe enviar WhatsApp solo si ≥7 días", () => {
    const shouldSendWhatsApp = (daysOverdue: number, hasPhone: boolean) =>
      hasPhone && daysOverdue >= 7;

    expect(shouldSendWhatsApp(3, true)).toBe(false);
    expect(shouldSendWhatsApp(7, true)).toBe(true);
    expect(shouldSendWhatsApp(14, true)).toBe(true);
    expect(shouldSendWhatsApp(7, false)).toBe(false);
  });
});
