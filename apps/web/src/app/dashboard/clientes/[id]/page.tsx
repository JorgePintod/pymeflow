"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatCLP } from "@/lib/utils";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building2,
  CreditCard,
  Calendar,
} from "lucide-react";
import Link from "next/link";

interface Client {
  id: string;
  businessName: string;
  rut: string;
  email: string;
  phone: string | null;
  address: string | null;
  activity: string | null;
  paymentDays: number;
  creditLimit: number | null;
  totalInvoiced: number;
  totalPaid: number;
  isActive: boolean;
  createdAt: string;
}

interface Invoice {
  id: string;
  folio: number;
  status: string;
  totalAmount: number;
  issueDate: string;
  dueDate: string | null;
  paidAmount: number;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ISSUED: "Emitida",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  CANCELLED: "Anulada",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ISSUED: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-yellow-100 text-yellow-700",
};

export default function ClientProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: clientData, isLoading: loadingClient } = useQuery({
    queryKey: ["client", id],
    queryFn: () => api.getClient(id),
    enabled: !!id,
  });

  const invoiceParams = new URLSearchParams({ clientId: id, limit: "50" });
  const { data: invoicesData, isLoading: loadingInvoices } = useQuery({
    queryKey: ["invoices", "client", id],
    queryFn: () => api.getInvoices(invoiceParams.toString()),
    enabled: !!id,
  });

  const client = clientData?.data as Client | undefined;
  const invoices = (invoicesData?.data as unknown as Invoice[] | undefined) ?? [];

  if (loadingClient) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4 text-gray-500">
        <p>Cliente no encontrado.</p>
        <button
          onClick={() => router.back()}
          className="text-brand-600 hover:underline"
        >
          Volver
        </button>
      </div>
    );
  }

  const overdueAmount = invoices
    .filter((i) => i.status === "OVERDUE")
    .reduce((sum, i) => sum + (i.totalAmount - i.paidAmount), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/clientes"
          className="rounded-lg p-2 hover:bg-gray-100"
          title="Volver a clientes"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{client.businessName}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                client.isActive
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {client.isActive ? "Activo" : "Inactivo"}
            </span>
          </div>
          <p className="text-sm text-gray-500">RUT {client.rut}</p>
        </div>
        <Link
          href={`/dashboard/clientes?editId=${client.id}`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Editar cliente
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total facturado</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatCLP(client.totalInvoiced)}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total pagado</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {formatCLP(client.totalPaid)}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Deuda vencida</p>
          <p className={`mt-1 text-2xl font-bold ${overdueAmount > 0 ? "text-red-600" : "text-gray-900"}`}>
            {formatCLP(overdueAmount)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Client Info */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Información</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2 text-gray-700">
              <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
              <span>{client.email}</span>
            </div>
            {client.phone && (
              <div className="flex items-start gap-2 text-gray-700">
                <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <span>{client.phone}</span>
              </div>
            )}
            {client.address && (
              <div className="flex items-start gap-2 text-gray-700">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <span>{client.address}</span>
              </div>
            )}
            {client.activity && (
              <div className="flex items-start gap-2 text-gray-700">
                <Building2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <span>{client.activity}</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-gray-700">
              <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
              <span>{client.paymentDays} días de pago</span>
            </div>
            {client.creditLimit != null && (
              <div className="flex items-start gap-2 text-gray-700">
                <CreditCard className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <span>Límite: {formatCLP(client.creditLimit)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Invoice History */}
        <div className="rounded-xl border bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Historial de facturas</h2>
            <Link
              href={`/dashboard/facturas/nueva?clientId=${client.id}`}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              + Nueva factura
            </Link>
          </div>
          {loadingInvoices ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400">
              Sin facturas registradas
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Folio</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Monto</th>
                    <th className="px-4 py-3">Pagado</th>
                    <th className="px-4 py-3">Emisión</th>
                    <th className="px-4 py-3">Vencimiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/facturas/${inv.id}`}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          #{inv.folio}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {STATUS_LABELS[inv.status] ?? inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{formatCLP(inv.totalAmount)}</td>
                      <td className="px-4 py-3 text-green-600">{formatCLP(inv.paidAmount)}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(inv.issueDate).toLocaleDateString("es-CL")}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {inv.dueDate
                          ? new Date(inv.dueDate).toLocaleDateString("es-CL")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
