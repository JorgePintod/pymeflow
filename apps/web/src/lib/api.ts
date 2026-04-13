const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  const headers: Record<string, string> = {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(options.headers as Record<string, string>),
  };

  // Añadir Content-Type solo si hay body (evita errores al POST sin body)
  if (options.body !== undefined && !(headers["Content-Type"])) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && token) {
    // Intentar refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.Authorization = `Bearer ${localStorage.getItem("accessToken")}`;
      const retry = await fetch(`${API_URL}${path}`, { ...options, headers });
      if (retry.ok) return retry.json();
    }
    // Si no se pudo refrescar, limpiar y redirigir
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    if (typeof window !== "undefined") window.location.href = "/login";
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.message || `Error ${res.status}`,
      res.status,
      body.error,
      body.data,
    );
  }

  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem("accessToken", data.data.accessToken);
    localStorage.setItem("refreshToken", data.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ─── API Methods ─────────────────────────────────────────

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ success: boolean; data: { accessToken: string; refreshToken: string; user: unknown; tenant: unknown } }>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    ),

  register: (data: Record<string, string>) =>
    request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getProfile: () => request<{ success: boolean; data: unknown }>("/api/v1/auth/me"),

  // Dashboard
  getMetrics: () =>
    request<{ success: boolean; data: DashboardMetrics }>("/api/v1/dashboard/metrics"),

  // Clients
  getClients: (params?: string) =>
    request<{ success: boolean; data: unknown[]; pagination: Pagination }>(
      `/api/v1/clients${params ? `?${params}` : ""}`,
    ),

  getClient: (id: string) =>
    request<{ success: boolean; data: unknown }>(`/api/v1/clients/${id}`),

  createClient: (data: unknown) =>
    request<{ success: boolean; data: unknown }>("/api/v1/clients", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateClient: (id: string, data: unknown) =>
    request<{ success: boolean; data: unknown }>(`/api/v1/clients/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteClient: (id: string) =>
    request<{ success: boolean }>(`/api/v1/clients/${id}`, {
      method: "DELETE",
    }),

  reactivateClient: (id: string) =>
    request<{ success: boolean; data: unknown }>(`/api/v1/clients/${id}/reactivate`, {
      method: "POST",
    }),

  // Invoices
  getInvoices: (params?: string) =>
    request<{ success: boolean; data: InvoiceSummary[]; pagination: Pagination }>(
      `/api/v1/invoices${params ? `?${params}` : ""}`,
    ),

  getInvoice: (id: string) =>
    request<{ success: boolean; data: InvoiceDetail }>(`/api/v1/invoices/${id}`),

  createInvoice: (data: unknown) =>
    request("/api/v1/invoices", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateInvoice: (id: string, data: unknown) =>
    request(`/api/v1/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  issueInvoice: (id: string) =>
    request(`/api/v1/invoices/${id}/issue`, { method: "POST" }),

  cancelInvoice: (id: string) =>
    request(`/api/v1/invoices/${id}/cancel`, { method: "POST" }),

  registerPayment: (invoiceId: string, data: unknown) =>
    request(`/api/v1/invoices/${invoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getInvoicePdfUrl: (id: string) => `${API_URL}/api/v1/invoices/${id}/pdf`,

  getInvoicePdf: async (id: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
    const res = await fetch(`${API_URL}/api/v1/invoices/${id}/pdf`, {
      method: "GET",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(body.message || `Error ${res.status}`, res.status, body.error, body.data);
    }
    const blob = await res.blob();
    return blob;
  },

  // ── Push Notifications ──────────────────────────────

  pushSubscribe: (subscription: unknown) =>
    request("/api/v1/notifications/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ subscription }),
    }),

  pushUnsubscribe: (endpoint: string) =>
    request("/api/v1/notifications/push/subscribe", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    }),

  // ── Notifications ───────────────────────────────────

  getNotifications: (params?: string) =>
    request<{ success: boolean; data: NotificationItem[]; pagination: Pagination }>(
      `/api/v1/notifications${params ? `?${params}` : ""}`,
    ),

  markNotificationRead: (id: string) =>
    request(`/api/v1/notifications/${id}/read`, { method: "PATCH" }),

  markAllNotificationsRead: () =>
    request("/api/v1/notifications/read-all", { method: "POST" }),

  // ── Collections (cobranza) ──────────────────────────

  getCollectionSettings: () =>
    request<{ success: boolean; data: CollectionSettings }>("/api/v1/collections/settings"),

  updateCollectionSettings: (data: Partial<CollectionSettings>) =>
    request("/api/v1/collections/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  getCollectionLogs: (params?: string) =>
    request<{ success: boolean; data: unknown[]; pagination: Pagination }>(
      `/api/v1/collections/logs${params ? `?${params}` : ""}`,
    ),

  runCollections: () =>
    request("/api/v1/collections/run", { method: "POST" }),

  // ── SII Integration ─────────────────────────────────

  // Certificate
  uploadSiiCertificate: (data: { p12Base64: string; password: string }) =>
    request<{ success: boolean; data: SiiCertificateInfo }>("/api/v1/sii/certificate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getSiiCertificate: () =>
    request<{ success: boolean; data: SiiCertificateInfo | null }>("/api/v1/sii/certificate"),

  deleteSiiCertificate: () =>
    request<{ success: boolean }>("/api/v1/sii/certificate", { method: "DELETE" }),

  // CAF (Código de Autorización de Folios)
  uploadCaf: (data: { cafXml: string; environment?: string }) =>
    request<{ success: boolean; data: CafRange }>("/api/v1/sii/caf", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getCafRanges: () =>
    request<{ success: boolean; data: CafRange[] }>("/api/v1/sii/caf"),

  deleteCafRange: (id: string) =>
    request<{ success: boolean }>(`/api/v1/sii/caf/${id}`, { method: "DELETE" }),

  // DTE (Envío al SII)
  sendInvoiceToSii: (invoiceId: string) =>
    request<{ success: boolean; data: { trackId: string; siiStatus: string } }>(
      `/api/v1/sii/invoices/${invoiceId}/send`,
      { method: "POST" },
    ),

  getInvoiceSiiStatus: (invoiceId: string) =>
    request<{ success: boolean; data: { siiStatus: string; siiResponse: unknown } }>(
      `/api/v1/sii/invoices/${invoiceId}/status`,
    ),

  getInvoiceXmlUrl: (id: string) => `${API_URL}/api/v1/sii/invoices/${id}/xml`,

  // SII Config
  getSiiConfig: () =>
    request<{ success: boolean; data: SiiConfig }>("/api/v1/sii/config"),

  updateSiiConfig: (data: Partial<SiiConfig>) =>
    request<{ success: boolean; data: SiiConfig }>("/api/v1/sii/config", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // ── Cashflow (Flujo de Caja) ────────────────────────

  getCashflowSummary: () =>
    request<{ success: boolean; data: CashflowSummary }>("/api/v1/cashflow/summary"),

  getCashflowEntries: (params?: string) =>
    request<{ success: boolean; data: CashflowEntry[]; pagination: Pagination }>(
      `/api/v1/cashflow/entries${params ? `?${params}` : ""}`,
    ),

  createCashflowEntry: (data: unknown) =>
    request<{ success: boolean; data: CashflowEntry }>("/api/v1/cashflow/entries", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteCashflowEntry: (id: string) =>
    request<{ success: boolean }>(`/api/v1/cashflow/entries/${id}`, { method: "DELETE" }),

  syncCashflow: () =>
    request<{ success: boolean; data: { synced: number } }>("/api/v1/cashflow/sync", { method: "POST" }),

  // ── Expenses (Gastos) ───────────────────────────────

  getExpenses: (params?: string) =>
    request<{ success: boolean; data: Expense[]; pagination: Pagination }>(
      `/api/v1/expenses${params ? `?${params}` : ""}`,
    ),

  getExpense: (id: string) =>
    request<{ success: boolean; data: Expense }>(`/api/v1/expenses/${id}`),

  getExpenseSummary: () =>
    request<{ success: boolean; data: ExpenseSummary }>("/api/v1/expenses/summary"),

  createExpense: (data: unknown) =>
    request<{ success: boolean; data: Expense }>("/api/v1/expenses", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateExpense: (id: string, data: unknown) =>
    request<{ success: boolean; data: Expense }>(`/api/v1/expenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteExpense: (id: string) =>
    request<{ success: boolean }>(`/api/v1/expenses/${id}`, { method: "DELETE" }),

  markExpensePaid: (id: string, paidAt?: string) =>
    request<{ success: boolean; data: Expense }>(`/api/v1/expenses/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ paidAt }),
    }),

  // ── Subscriptions (Suscripciones) ───────────────────

  getSubscription: () =>
    request<{ success: boolean; data: SubscriptionInfo }>("/api/v1/subscriptions"),

  createCheckout: (plan: string) =>
    request<{ success: boolean; data: { url: string } }>("/api/v1/subscriptions/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    }),

  createPortalSession: () =>
    request<{ success: boolean; data: { url: string } }>("/api/v1/subscriptions/portal", {
      method: "POST",
    }),
};

// ─── Types ───────────────────────────────────────────────

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface InvoiceSummary {
  id: string;
  documentType: string;
  folio: number | null;
  status: string;
  siiStatus: string;
  netAmount: number;
  ivaAmount: number;
  totalAmount: number;
  issueDate: string;
  dueDate: string;
  paidAt: string | null;
  internalRef: string | null;
  createdAt: string;
  client: {
    id: string;
    rut: string;
    businessName: string;
  };
}

export interface DashboardMetrics {
  invoices: {
    total: number;
    totalAmount: number;
    monthlyCount: number;
    monthlyAmount: number;
    overdueCount: number;
    overdueAmount: number;
    paidAmount: number;
  };
  clients: {
    activeCount: number;
    topClients: Array<{
      id: string;
      businessName: string;
      rut: string;
      totalInvoiced: number;
      totalPaid: number;
      overdueAmount: number;
    }>;
  };
  statusBreakdown: Array<{
    status: string;
    count: number;
    amount: number;
  }>;
  recentInvoices: Array<{
    id: string;
    folio: number | null;
    status: string;
    totalAmount: number;
    issueDate: string;
    dueDate: string;
    client: { businessName: string; rut: string };
  }>;
}

export { ApiError };

export interface InvoiceDetail extends Omit<InvoiceSummary, "client"> {
  paidAmount: number;
  creditDays: number;
  notes: string | null;
  client: {
    id: string;
    rut: string;
    businessName: string;
    email: string;
    phone: string | null;
    address: string | null;
  };
  items: Array<{
    id: string;
    code: string | null;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    discount: number;
    lineTotal: number;
    isExempt: boolean;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    paidAt: string;
    paymentMethod: string;
    reference: string | null;
    notes: string | null;
  }>;
}

export interface NotificationItem {
  id: string;
  createdAt: string;
  tenantId: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  data: Record<string, unknown> | null;
}

export interface CollectionSettings {
  collectionEnabled: boolean;
  collectionDays: number[];
}

// ─── SII Types ───────────────────────────────────────────

export interface SiiCertificateInfo {
  subject: {
    commonName: string;
    serialNumber?: string;
    organization?: string;
    email?: string;
  };
  issuer: string;
  validFrom: string;
  validTo: string;
  isValid: boolean;
  serialNumber: string;
}

export interface CafRange {
  id: string;
  documentType: string;
  environment: string;
  folioStart: number;
  folioEnd: number;
  nextFolio: number;
  isActive: boolean;
  isExhausted: boolean;
  expiresAt: string | null;
  authorizedAt: string | null;
  createdAt: string;
}

export interface SiiConfig {
  siiEnvironment: string;
  siiResolution: string | null;
  siiResolutionDate: string | null;
  hasCertificate: boolean;
  certificateInfo: SiiCertificateInfo | null;
  economicActivity: string | null;
  address: string | null;
  commune: string | null;
}

// ─── Cashflow Types ──────────────────────────────────────

export interface DailyProjection {
  date: string;
  income: number;
  expense: number;
  balance: number;
}

export interface MonthlyProjection {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export interface CashflowSummary {
  currentBalance: number;
  projectedBalance30: number;
  projectedBalance60: number;
  projectedBalance90: number;
  pendingIncome: number;
  pendingExpenses: number;
  dailyProjections: DailyProjection[];
  monthlyProjections: MonthlyProjection[];
  alertLevel: "OK" | "WARNING" | "CRITICAL";
}

export interface CashflowEntry {
  id: string;
  entryDate: string;
  description: string;
  type: "INCOME" | "EXPENSE" | "PROJECTION";
  amount: number;
  category: string | null;
  isConfirmed: boolean;
  sourceId: string | null;
  createdAt: string;
}

// ─── Expense Types ───────────────────────────────────────

export interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  netAmount: number;
  ivaAmount: number;
  issueDate: string;
  dueDate: string | null;
  paidAt: string | null;
  providerRut: string | null;
  providerName: string | null;
  documentType: string | null;
  folio: string | null;
  createdAt: string;
}

export interface ExpenseSummary {
  totalExpenses: number;
  totalIvaCredito: number;
  monthlyExpenses: number;
  monthlyIvaCredito: number;
  byCategory: Array<{
    category: string;
    total: number;
    count: number;
  }>;
}

// ─── Subscription Types ──────────────────────────────────

export interface SubscriptionInfo {
  plan: string;
  planExpiresAt: string | null;
  stripeCustomerId: string | null;
  subscription: {
    id: string;
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
}
