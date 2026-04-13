"use client";

import { useDashboardMetrics } from "@/hooks/useInvoices";
import { formatCLP, getInvoiceStatus, formatDate } from "@/lib/utils";
import {
  FileText,
  Users,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboardMetrics();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-red-600">
        Error al cargar métricas. Verifica tu conexión.
      </div>
    );
  }

  const m = data.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Facturado este mes"
          value={formatCLP(m.invoices.monthlyAmount)}
          subtitle={`${m.invoices.monthlyCount} facturas`}
          icon={<TrendingUp className="h-5 w-5 text-brand-600" />}
        />
        <KpiCard
          title="Total cobrado"
          value={formatCLP(m.invoices.paidAmount)}
          subtitle="Pagos recibidos"
          icon={<FileText className="h-5 w-5 text-green-600" />}
        />
        <KpiCard
          title="Por cobrar (vencido)"
          value={formatCLP(m.invoices.overdueAmount)}
          subtitle={`${m.invoices.overdueCount} facturas`}
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          alert={m.invoices.overdueCount > 0}
        />
        <KpiCard
          title="Clientes activos"
          value={String(m.clients.activeCount)}
          icon={<Users className="h-5 w-5 text-indigo-600" />}
        />
      </div>

      {/* Status Breakdown + Recent invoices */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status breakdown */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-500 uppercase">
            Estado de facturas
          </h2>
          <div className="space-y-3">
            {m.statusBreakdown.map((s) => {
              const st = getInvoiceStatus(s.status);
              return (
                <div key={s.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.color}`}
                    >
                      {st.label}
                    </span>
                    <span className="text-sm text-gray-500">
                      {s.count} documento{s.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {formatCLP(s.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent invoices */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase">
              Últimas facturas
            </h2>
            <Link
              href="/dashboard/facturas"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Ver todas →
            </Link>
          </div>
          <div className="space-y-3">
            {m.recentInvoices.map((inv) => {
              const st = getInvoiceStatus(inv.status);
              return (
                <Link
                  key={inv.id}
                  href={`/dashboard/facturas/${inv.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 transition hover:bg-gray-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {inv.folio ? `#${inv.folio}` : "Borrador"} —{" "}
                      {inv.client.businessName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(inv.issueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCLP(inv.totalAmount)}
                    </p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </Link>
              );
            })}
            {m.recentInvoices.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">
                Sin facturas aún
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Top clients */}
      {m.clients.topClients.length > 0 && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-500 uppercase">
            Principales clientes
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-gray-500">
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">RUT</th>
                  <th className="pb-2 text-right font-medium">Facturado</th>
                  <th className="pb-2 text-right font-medium">Pagado</th>
                  <th className="pb-2 text-right font-medium">Vencido</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {m.clients.topClients.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 font-medium text-gray-900">
                      {c.businessName}
                    </td>
                    <td className="py-2.5 text-gray-500">{c.rut}</td>
                    <td className="py-2.5 text-right">
                      {formatCLP(c.totalInvoiced)}
                    </td>
                    <td className="py-2.5 text-right text-green-600">
                      {formatCLP(c.totalPaid)}
                    </td>
                    <td className="py-2.5 text-right text-red-600">
                      {c.overdueAmount > 0 ? formatCLP(c.overdueAmount) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  alert,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-sm ${alert ? "border-red-200" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase text-gray-500">
          {title}
        </span>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && (
        <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
      )}
    </div>
  );
}
