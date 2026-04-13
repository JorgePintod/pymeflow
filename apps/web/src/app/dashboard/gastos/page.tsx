"use client";

import { useState } from "react";
import { useExpenses, useExpenseSummary, useCreateExpense, useDeleteExpense, useMarkExpensePaid } from "@/hooks/useCashflow";
import { formatCLP, formatDate, cn } from "@/lib/utils";
import type { Expense } from "@/lib/api";
import {
  Plus,
  Trash2,
  CheckCircle,
  Receipt,
  DollarSign,
  PieChart,
  X,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  REMUNERACIONES: "Remuneraciones",
  ARRIENDO: "Arriendo",
  SERVICIOS_BASICOS: "Servicios básicos",
  MATERIALES: "Materiales",
  TRANSPORTE: "Transporte",
  MARKETING: "Marketing",
  SOFTWARE: "Software",
  CONTABILIDAD: "Contabilidad",
  OTROS: "Otros",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS);

export default function ExpensesPage() {
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPaid, setFilterPaid] = useState("");
  const [showForm, setShowForm] = useState(false);

  const params = new URLSearchParams();
  if (filterCategory) params.set("category", filterCategory);
  if (filterPaid) params.set("isPaid", filterPaid);
  const queryStr = params.toString();

  const { data: expensesRes, isLoading } = useExpenses(queryStr || undefined);
  const { data: summaryRes } = useExpenseSummary();
  const createMutation = useCreateExpense();
  const deleteMutation = useDeleteExpense();
  const markPaidMutation = useMarkExpensePaid();

  const expenses = expensesRes?.data ?? [];
  const summary = summaryRes?.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Registrar gasto
        </button>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Total gastos (mes)"
            value={formatCLP(summary.monthlyExpenses)}
            icon={<DollarSign className="h-5 w-5 text-red-500" />}
          />
          <SummaryCard
            title="IVA Crédito Fiscal (mes)"
            value={formatCLP(summary.monthlyIvaCredito)}
            icon={<Receipt className="h-5 w-5 text-blue-600" />}
          />
          <SummaryCard
            title="Total acumulado"
            value={formatCLP(summary.totalExpenses)}
            icon={<PieChart className="h-5 w-5 text-gray-600" />}
          />
          <SummaryCard
            title="IVA Crédito total"
            value={formatCLP(summary.totalIvaCredito)}
            icon={<Receipt className="h-5 w-5 text-green-600" />}
          />
        </div>
      )}

      {/* Category Breakdown */}
      {summary && summary.byCategory.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Gastos por categoría</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summary.byCategory.map((cat) => (
              <div key={cat.category} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {CATEGORY_LABELS[cat.category] ?? cat.category}
                  </p>
                  <p className="text-xs text-gray-500">{cat.count} gastos</p>
                </div>
                <p className="text-sm font-semibold text-gray-700">{formatCLP(cat.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select
          value={filterPaid}
          onChange={(e) => setFilterPaid(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Todos</option>
          <option value="true">Pagados</option>
          <option value="false">Pendientes</option>
        </select>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <CreateExpenseForm
          onSubmit={(data) => {
            createMutation.mutate(data, {
              onSuccess: () => setShowForm(false),
            });
          }}
          isPending={createMutation.isPending}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Expenses Table */}
      <div className="rounded-lg border bg-white">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Descripción</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Categoría</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Neto</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">IVA</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Total</th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase text-gray-500">Estado</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {expenses.map((exp: Expense) => (
                  <tr key={exp.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {formatDate(exp.issueDate)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {exp.description}
                      {exp.providerName && (
                        <span className="block text-xs text-gray-500">{exp.providerName}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {CATEGORY_LABELS[exp.category] ?? exp.category}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-700">
                      {formatCLP(exp.netAmount)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-500">
                      {formatCLP(exp.ivaAmount)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900">
                      {formatCLP(exp.amount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "rounded-full px-2 py-1 text-xs font-medium",
                        exp.paidAt ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700",
                      )}>
                        {exp.paidAt ? "Pagado" : "Pendiente"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {!exp.paidAt && (
                          <button
                            onClick={() => markPaidMutation.mutate({ id: exp.id })}
                            className="text-gray-400 hover:text-green-600"
                            title="Marcar pagado"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteMutation.mutate(exp.id)}
                          className="text-gray-400 hover:text-red-500"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                      No hay gastos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────

function SummaryCard({ title, value, icon }: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{title}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function CreateExpenseForm({ onSubmit, isPending, onClose }: {
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    description: "",
    category: "OTROS",
    amount: "",
    issueDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    providerRut: "",
    providerName: "",
    documentType: "",
    folio: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = {
      description: form.description,
      category: form.category,
      amount: Number(form.amount),
      issueDate: form.issueDate,
    };
    if (form.dueDate) data.dueDate = form.dueDate;
    if (form.providerRut) data.providerRut = form.providerRut;
    if (form.providerName) data.providerName = form.providerName;
    if (form.documentType) data.documentType = form.documentType;
    if (form.folio) data.folio = form.folio;
    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Registrar gasto</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Descripción *</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Categoría</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Monto total (CLP) *</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                min="1"
                required
              />
              <p className="mt-1 text-xs text-gray-500">IVA se calcula automáticamente (19%)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Fecha emisión *</label>
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Fecha vencimiento</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">RUT proveedor</label>
              <input
                type="text"
                value={form.providerRut}
                onChange={(e) => setForm({ ...form, providerRut: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="76.123.456-7"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre proveedor</label>
              <input
                type="text"
                value={form.providerName}
                onChange={(e) => setForm({ ...form, providerName: e.target.value })}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
              {isPending ? "Guardando..." : "Registrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
