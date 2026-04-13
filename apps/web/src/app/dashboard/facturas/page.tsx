"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInvoices } from "@/hooks/useInvoices";
import { formatCLP, formatDate, getInvoiceStatus } from "@/lib/utils";
import Link from "next/link";
import { Plus, Search, FileText } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "DRAFT", label: "Borrador" },
  { value: "ISSUED", label: "Emitida" },
  { value: "SENT", label: "Enviada" },
  { value: "PARTIAL", label: "Pago parcial" },
  { value: "PAID", label: "Pagada" },
  { value: "OVERDUE", label: "Vencida" },
  { value: "CANCELLED", label: "Anulada" },
];

export default function InvoicesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("limit", "20");

  const { data, isLoading } = useInvoices(params.toString());

  const invoices = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Facturas</h1>
        <Link
          href="/dashboard/facturas/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Nueva factura
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, RUT, referencia..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-gray-400">
            <FileText className="mb-2 h-10 w-10" />
            <p className="text-sm">No hay facturas</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">N° / Tipo</th>
                <th className="px-4 py-3 font-medium text-gray-500">Cliente</th>
                <th className="px-4 py-3 font-medium text-gray-500">Fecha</th>
                <th className="px-4 py-3 font-medium text-gray-500">Vence</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">
                  Total
                </th>
                <th className="px-4 py-3 font-medium text-gray-500">Estado</th>
                <th className="px-4 py-3 font-medium text-gray-500">SII</th>
                <th className="px-4 py-3 font-medium text-gray-500">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((inv) => {
                const st = getInvoiceStatus(inv.status);
                return (
                  <tr
                    key={inv.id}
                    onClick={() => router.push(`/dashboard/facturas/${inv.id}`)}
                    className="cursor-pointer transition hover:bg-brand-50"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-brand-600">
                        {inv.folio ? `#${inv.folio}` : "Borrador"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">
                        {inv.client.businessName}
                      </p>
                      <p className="text-xs text-gray-500">{inv.client.rut}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(inv.issueDate)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(inv.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {formatCLP(inv.totalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.color}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {inv.siiStatus ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/facturas/${inv.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        {inv.status === "DRAFT" ? "▶ Emitir" : "Ver detalle"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Mostrando {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} de{" "}
            {pagination.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!pagination.hasMore}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
