"use client";

import { useState } from "react";
import { useCashflowSummary, useCashflowEntries, useCreateCashflowEntry, useDeleteCashflowEntry, useSyncCashflow } from "@/hooks/useCashflow";
import { formatCLP, formatDate, cn } from "@/lib/utils";
import type { CashflowEntry } from "@/lib/api";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  DollarSign,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const ALERT_STYLES = {
  OK: "bg-green-50 text-green-700 border-green-200",
  WARNING: "bg-yellow-50 text-yellow-700 border-yellow-200",
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
};

export default function CashflowPage() {
  const { data: summaryRes, isLoading } = useCashflowSummary();
  const { data: entriesRes } = useCashflowEntries("limit=20");
  const syncMutation = useSyncCashflow();
  const deleteMutation = useDeleteCashflowEntry();
  const createMutation = useCreateCashflowEntry();
  const [showForm, setShowForm] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const summary = summaryRes?.data;
  const entries = entriesRes?.data ?? [];

  if (!summary) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-red-600">
        Error al cargar flujo de caja.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Flujo de Caja</h1>
        <div className="flex gap-2">
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={cn("h-4 w-4", syncMutation.isPending && "animate-spin")} />
            Sincronizar
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Entrada manual
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {summary.alertLevel !== "OK" && (
        <div className={cn("flex items-center gap-3 rounded-lg border p-4", ALERT_STYLES[summary.alertLevel])}>
          <AlertTriangle className="h-5 w-5" />
          <span className="text-sm font-medium">
            {summary.alertLevel === "WARNING"
              ? "Tu flujo de caja proyectado es bajo en los próximos 30 días"
              : "¡Alerta! Se proyecta flujo de caja negativo"}
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Balance actual"
          value={formatCLP(summary.currentBalance)}
          icon={<DollarSign className="h-5 w-5 text-brand-600" />}
        />
        <KpiCard
          title="Proyección 30 días"
          value={formatCLP(summary.projectedBalance30)}
          icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
          alert={summary.projectedBalance30 < 0}
        />
        <KpiCard
          title="Ingresos pendientes"
          value={formatCLP(summary.pendingIncome)}
          icon={<TrendingUp className="h-5 w-5 text-green-600" />}
        />
        <KpiCard
          title="Gastos pendientes"
          value={formatCLP(summary.pendingExpenses)}
          icon={<TrendingDown className="h-5 w-5 text-red-500" />}
        />
      </div>

      {/* Projections Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <ProjectionCard label="30 días" value={summary.projectedBalance30} />
        <ProjectionCard label="60 días" value={summary.projectedBalance60} />
        <ProjectionCard label="90 días" value={summary.projectedBalance90} />
      </div>

      {/* Form */}
      {showForm && (
        <ManualEntryForm
          onSubmit={(data) => {
            createMutation.mutate(data, {
              onSuccess: () => setShowForm(false),
            });
          }}
          isPending={createMutation.isPending}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Daily Projection Chart */}
      {summary.dailyProjections.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Proyección diaria (90 días)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={summary.dailyProjections}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}
                tick={{ fontSize: 11 }}
              />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [formatCLP(value), ""]}
                labelFormatter={(d) => formatDate(d as string)}
              />
              <Area type="monotone" dataKey="balance" stroke="#4f46e5" fill="#eef2ff" name="Balance" />
              <Area type="monotone" dataKey="income" stroke="#16a34a" fill="#f0fdf4" name="Ingreso" />
              <Area type="monotone" dataKey="expense" stroke="#dc2626" fill="#fef2f2" name="Gasto" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly Bar Chart */}
      {summary.monthlyProjections.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Proyección mensual</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={summary.monthlyProjections}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => [formatCLP(value), ""]} />
              <Legend />
              <Bar dataKey="income" fill="#16a34a" name="Ingresos" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#dc2626" name="Gastos" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Entries Table */}
      <div className="rounded-lg border bg-white">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Movimientos recientes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Descripción</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Tipo</th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Monto</th>
                <th className="px-6 py-3 text-center text-xs font-medium uppercase text-gray-500">Estado</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry: CashflowEntry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {formatDate(entry.entryDate)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{entry.description}</td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "rounded-full px-2 py-1 text-xs font-medium",
                      entry.type === "INCOME" ? "bg-green-100 text-green-700" :
                      entry.type === "EXPENSE" ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700",
                    )}>
                      {entry.type === "INCOME" ? "Ingreso" : entry.type === "EXPENSE" ? "Gasto" : "Proyección"}
                    </span>
                  </td>
                  <td className={cn(
                    "whitespace-nowrap px-6 py-4 text-right text-sm font-medium",
                    entry.type === "INCOME" ? "text-green-600" : "text-red-600",
                  )}>
                    {entry.type === "INCOME" ? "+" : "-"}{formatCLP(entry.amount)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={cn(
                      "rounded-full px-2 py-1 text-xs",
                      entry.isConfirmed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600",
                    )}>
                      {entry.isConfirmed ? "Confirmado" : "Pendiente"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {!entry.sourceId && (
                      <button
                        onClick={() => deleteMutation.mutate(entry.id)}
                        className="text-gray-400 hover:text-red-500"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    Sin movimientos. Sincroniza o agrega entradas manuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function KpiCard({ title, value, icon, alert }: {
  title: string;
  value: string;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-lg border bg-white p-5",
      alert && "border-red-200 bg-red-50",
    )}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{title}</p>
        {icon}
      </div>
      <p className={cn("mt-2 text-2xl font-bold", alert ? "text-red-700" : "text-gray-900")}>
        {value}
      </p>
    </div>
  );
}

function ProjectionCard({ label, value }: { label: string; value: number }) {
  const isNeg = value < 0;
  return (
    <div className={cn(
      "rounded-lg border p-4 text-center",
      isNeg ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50",
    )}>
      <p className="text-sm text-gray-500">Proyección {label}</p>
      <p className={cn("text-xl font-bold", isNeg ? "text-red-700" : "text-green-700")}>
        {formatCLP(value)}
      </p>
    </div>
  );
}

function ManualEntryForm({ onSubmit, isPending, onCancel }: {
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    entryDate: new Date().toISOString().split("T")[0],
    description: "",
    type: "INCOME",
    amount: "",
    category: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      amount: Number(form.amount),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">Nueva entrada manual</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Fecha</label>
          <input
            type="date"
            value={form.entryDate}
            onChange={(e) => setForm({ ...form, entryDate: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Tipo</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          >
            <option value="INCOME">Ingreso</option>
            <option value="EXPENSE">Gasto</option>
            <option value="PROJECTION">Proyección</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Monto (CLP)</label>
          <input
            type="number"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            min="1"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Descripción</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            required
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
          Cancelar
        </button>
        <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {isPending ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}
