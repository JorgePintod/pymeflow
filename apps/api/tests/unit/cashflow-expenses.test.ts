import { describe, it, expect } from "vitest";

// ─── Cashflow projection helpers (unit testable logic) ─────

describe("Cashflow Projections", () => {
  describe("calculateAlertLevel", () => {
    function calculateAlertLevel(
      current: number,
      projected30: number,
      projected60: number,
    ): "OK" | "WARNING" | "CRITICAL" {
      if (projected30 < 0 || projected60 < 0 || current < 0) return "CRITICAL";
      if (projected30 < current * 0.2) return "WARNING";
      return "OK";
    }

    it("debe retornar OK si flujo es saludable", () => {
      expect(calculateAlertLevel(1000000, 800000, 700000)).toBe("OK");
    });

    it("debe retornar WARNING si 30d es < 20% del balance actual", () => {
      expect(calculateAlertLevel(1000000, 150000, 500000)).toBe("WARNING");
    });

    it("debe retornar CRITICAL si proyección es negativa", () => {
      expect(calculateAlertLevel(500000, -100000, -200000)).toBe("CRITICAL");
    });

    it("debe retornar CRITICAL si balance actual es negativo", () => {
      expect(calculateAlertLevel(-100000, 500000, 500000)).toBe("CRITICAL");
    });
  });

  describe("buildDailyProjections", () => {
    it("debe generar array de N días con balance acumulado", () => {
      const days = 5;
      const startBalance = 1000000;
      const dailyIncome = 50000;
      const dailyExpense = 30000;

      const projections = [];
      let balance = startBalance;

      for (let i = 0; i < days; i++) {
        balance += dailyIncome - dailyExpense;
        const date = new Date();
        date.setDate(date.getDate() + i);
        projections.push({
          date: date.toISOString().split("T")[0],
          income: dailyIncome,
          expense: dailyExpense,
          balance,
        });
      }

      expect(projections).toHaveLength(5);
      expect(projections[0]!.balance).toBe(1020000);
      expect(projections[4]!.balance).toBe(1100000);
    });
  });

  describe("buildMonthlyProjections", () => {
    it("debe agrupar por mes correctamente", () => {
      interface DailyProjection {
        date: string;
        income: number;
        expense: number;
        balance: number;
      }

      function buildMonthly(dailyProjections: DailyProjection[]) {
        const monthMap = new Map<string, { income: number; expense: number }>();

        for (const day of dailyProjections) {
          const month = day.date.substring(0, 7); // YYYY-MM
          const entry = monthMap.get(month) ?? { income: 0, expense: 0 };
          entry.income += day.income;
          entry.expense += day.expense;
          monthMap.set(month, entry);
        }

        return Array.from(monthMap.entries()).map(([month, data]) => ({
          month,
          income: data.income,
          expense: data.expense,
          net: data.income - data.expense,
        }));
      }

      const daily: DailyProjection[] = [
        { date: "2025-01-01", income: 100, expense: 50, balance: 50 },
        { date: "2025-01-15", income: 200, expense: 60, balance: 190 },
        { date: "2025-02-01", income: 300, expense: 100, balance: 390 },
      ];

      const monthly = buildMonthly(daily);
      expect(monthly).toHaveLength(2);
      expect(monthly[0]).toEqual({
        month: "2025-01",
        income: 300,
        expense: 110,
        net: 190,
      });
      expect(monthly[1]).toEqual({
        month: "2025-02",
        income: 300,
        expense: 100,
        net: 200,
      });
    });
  });
});

// ─── Expense IVA Calculation ─────────────────────────────

describe("Expense IVA Calculation", () => {
  const IVA_RATE = 0.19;

  function calculateIvaSplit(amount: number) {
    const netAmount = Math.round(amount / (1 + IVA_RATE));
    const ivaAmount = amount - netAmount;
    return { netAmount, ivaAmount };
  }

  it("debe calcular correctamente el split IVA para $119.000", () => {
    const { netAmount, ivaAmount } = calculateIvaSplit(119000);
    expect(netAmount).toBe(100000);
    expect(ivaAmount).toBe(19000);
  });

  it("debe calcular correctamente el split IVA para $11.900", () => {
    const { netAmount, ivaAmount } = calculateIvaSplit(11900);
    expect(netAmount).toBe(10000);
    expect(ivaAmount).toBe(1900);
  });

  it("debe redondear a entero (CLP)", () => {
    const { netAmount, ivaAmount } = calculateIvaSplit(10000);
    expect(Number.isInteger(netAmount)).toBe(true);
    expect(Number.isInteger(ivaAmount)).toBe(true);
    expect(netAmount + ivaAmount).toBe(10000);
  });

  it("debe manejar montos pequeños", () => {
    const { netAmount, ivaAmount } = calculateIvaSplit(100);
    expect(netAmount).toBeGreaterThan(0);
    expect(ivaAmount).toBeGreaterThanOrEqual(0);
    expect(netAmount + ivaAmount).toBe(100);
  });

  it("crédito fiscal IVA es la suma de ivaAmount de gastos", () => {
    const expenses = [
      { amount: 119000 },
      { amount: 59500 },
      { amount: 23800 },
    ];

    const totalIvaCredito = expenses.reduce((sum, e) => {
      const { ivaAmount } = calculateIvaSplit(e.amount);
      return sum + ivaAmount;
    }, 0);

    expect(totalIvaCredito).toBe(19000 + 9500 + 3800);
  });
});

// ─── Plan Limits ─────────────────────────────────────────

describe("Plan Limits", () => {
  const PLAN_LIMITS: Record<string, number> = {
    FREE: 20,
    STARTER: 100,
    PROFESSIONAL: Infinity,
    ENTERPRISE: Infinity,
  };

  function isOverLimit(plan: string, dteCount: number): boolean {
    const limit = PLAN_LIMITS[plan] ?? 0;
    return dteCount >= limit;
  }

  it("FREE: permite hasta 20 DTE", () => {
    expect(isOverLimit("FREE", 19)).toBe(false);
    expect(isOverLimit("FREE", 20)).toBe(true);
    expect(isOverLimit("FREE", 21)).toBe(true);
  });

  it("STARTER: permite hasta 100 DTE", () => {
    expect(isOverLimit("STARTER", 99)).toBe(false);
    expect(isOverLimit("STARTER", 100)).toBe(true);
  });

  it("PROFESSIONAL: sin límite", () => {
    expect(isOverLimit("PROFESSIONAL", 999999)).toBe(false);
  });

  it("ENTERPRISE: sin límite", () => {
    expect(isOverLimit("ENTERPRISE", 999999)).toBe(false);
  });

  it("plan expirado → aplica límite FREE", () => {
    const plan = "STARTER";
    const planExpired = true;
    const effectiveLimit = planExpired ? PLAN_LIMITS["FREE"]! : PLAN_LIMITS[plan]!;
    expect(effectiveLimit).toBe(20);
  });
});

// ─── Subscription Webhook Status Mapping ─────────────────

describe("Subscription Status Mapping", () => {
  const statusMap: Record<string, string> = {
    active: "ACTIVE",
    past_due: "PAST_DUE",
    canceled: "CANCELLED",
    trialing: "TRIALING",
  };

  it("debe mapear estados Stripe a estados internos", () => {
    expect(statusMap["active"]).toBe("ACTIVE");
    expect(statusMap["past_due"]).toBe("PAST_DUE");
    expect(statusMap["canceled"]).toBe("CANCELLED");
    expect(statusMap["trialing"]).toBe("TRIALING");
  });

  it("debe retornar undefined para estado desconocido", () => {
    expect(statusMap["unknown"]).toBeUndefined();
  });
});

// ─── Plan Pricing ────────────────────────────────────────

describe("Plan Pricing", () => {
  const PLAN_PRICES_CLP: Record<string, number> = {
    FREE: 0,
    STARTER: 4990,
    PROFESSIONAL: 9990,
    ENTERPRISE: 29990,
  };

  it("FREE es gratuito", () => {
    expect(PLAN_PRICES_CLP["FREE"]).toBe(0);
  });

  it("precios están en CLP entero", () => {
    Object.values(PLAN_PRICES_CLP).forEach((price) => {
      expect(Number.isInteger(price)).toBe(true);
    });
  });

  it("precios son ascendentes", () => {
    const prices = ["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"].map(
      (p) => PLAN_PRICES_CLP[p]!,
    );
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]!);
    }
  });
});
