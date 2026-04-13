"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useInvoice,
  useIssueInvoice,
  useCancelInvoice,
  useRegisterPayment,
} from "@/hooks/useInvoices";
import { formatCLP, formatDate, getInvoiceStatus } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  Download,
  Send,
  XCircle,
  DollarSign,
  FileCode,
  RefreshCw,
  Loader2,
} from "lucide-react";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: invoice, isLoading, error } = useInvoice(id);
  const issueInvoice = useIssueInvoice();
  const cancelInvoice = useCancelInvoice();
  const registerPayment = useRegisterPayment();

  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("TRANSFER");
  const [paymentRef, setPaymentRef] = useState("");
  const [actionError, setActionError] = useState("");

  const queryClient = useQueryClient();

  const sendToSii = useMutation({
    mutationFn: () => api.sendInvoiceToSii(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
    },
  });

  const querySiiStatus = useMutation({
    mutationFn: () => api.getInvoiceSiiStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-red-600">
        No se pudo cargar la factura.
      </div>
    );
  }

  const status = getInvoiceStatus(invoice.status);
  const remaining =
    (invoice.totalAmount ?? 0) - (invoice.paidAmount ?? 0);

  async function handleIssue() {
    setActionError("");
    try {
      await issueInvoice.mutateAsync(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al emitir");
    }
  }

  async function handleCancel() {
    setActionError("");
    if (!confirm("¿Estás seguro de anular esta factura?")) return;
    try {
      await cancelInvoice.mutateAsync(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al anular");
    }
  }

  async function handlePayment(e: React.FormEvent) {
    e.preventDefault();
    setActionError("");
    try {
      await registerPayment.mutateAsync({
        invoiceId: id,
        amount: Number(paymentAmount),
        paymentMethod,
        reference: paymentRef || undefined,
      });
      setShowPayment(false);
      setPaymentAmount("");
      setPaymentRef("");
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al registrar pago",
      );
    }
  }

  async function handleDownloadPdf() {
    try {
      const blob = await api.getInvoicePdf(id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Liberar después de un tiempo
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al descargar PDF");
    }
  }

  const canIssue = invoice.status === "DRAFT";
  const canCancel =
    invoice.status === "ISSUED" || invoice.status === "OVERDUE";
  const canPay =
    invoice.status === "ISSUED" ||
    invoice.status === "OVERDUE" ||
    invoice.status === "PARTIAL";
  const canSendToSii =
    invoice.status === "ISSUED" &&
    (invoice.siiStatus === "DRAFT" || !invoice.siiStatus);
  const canQuerySii =
    invoice.siiStatus === "PENDING" || invoice.siiStatus === "SENT";
  const hasXml = !!invoice.siiStatus && invoice.siiStatus !== "DRAFT";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-2 hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {invoice.internalRef}
            </h1>
            <span
              className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}
            >
              {status.label}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            PDF
          </button>
          {hasXml && (
            <button
              onClick={() => window.open(api.getInvoiceXmlUrl(id), "_blank")}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <FileCode className="h-4 w-4" />
              XML
            </button>
          )}
          {canSendToSii && (
            <button
              onClick={() => sendToSii.mutate()}
              disabled={sendToSii.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {sendToSii.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar al SII
            </button>
          )}
          {canQuerySii && (
            <button
              onClick={() => querySiiStatus.mutate()}
              disabled={querySiiStatus.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
            >
              {querySiiStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Consultar SII
            </button>
          )}
          {canIssue && (
            <button
              onClick={handleIssue}
              disabled={issueInvoice.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {issueInvoice.isPending ? "Emitiendo…" : "Emitir"}
            </button>
          )}
          {canPay && (
            <button
              onClick={() => setShowPayment(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <DollarSign className="h-4 w-4" />
              Registrar pago
            </button>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelInvoice.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Anular
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {actionError}
        </div>
      )}

      {/* Info grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">
            Cliente
          </h2>
          <p className="font-medium text-gray-900">
            {invoice.client?.businessName}
          </p>
          <p className="text-sm text-gray-500">{invoice.client?.rut}</p>
          <p className="text-sm text-gray-500">{invoice.client?.email}</p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">
            Documento
          </h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-gray-500">Tipo</dt>
            <dd className="font-medium">{invoice.documentType}</dd>
            <dt className="text-gray-500">Folio</dt>
            <dd className="font-medium">{invoice.folio ?? "—"}</dd>
            <dt className="text-gray-500">Emisión</dt>
            <dd className="font-medium">{formatDate(invoice.issueDate)}</dd>
            <dt className="text-gray-500">Vencimiento</dt>
            <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
          </dl>
        </div>
      </div>

      {/* SII Status */}
      {invoice.siiStatus && invoice.siiStatus !== "DRAFT" && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase text-gray-500">
            Estado SII
          </h2>
          <div className="flex items-center gap-4">
            <SiiStatusBadge status={invoice.siiStatus} />
            {invoice.folio && (
              <span className="text-sm text-gray-500">
                Folio: <span className="font-mono font-medium">{invoice.folio}</span>
              </span>
            )}
            {sendToSii.isError && (
              <span className="text-sm text-red-600">
                {sendToSii.error instanceof Error ? sendToSii.error.message : "Error al enviar"}
              </span>
            )}
            {querySiiStatus.isError && (
              <span className="text-sm text-red-600">
                {querySiiStatus.error instanceof Error ? querySiiStatus.error.message : "Error al consultar"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Items table */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Detalle de ítems
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                <th className="pb-2 pr-4">Descripción</th>
                <th className="pb-2 pr-4 text-right">Cant.</th>
                <th className="pb-2 pr-4 text-right">P. Unit.</th>
                <th className="pb-2 pr-4 text-right">Dcto.</th>
                <th className="pb-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items ?? []).map((item: any, i: number) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    {item.code && (
                      <span className="mr-1 text-gray-400">[{item.code}]</span>
                    )}
                    {item.description}
                  </td>
                  <td className="py-2 pr-4 text-right">{item.quantity}</td>
                  <td className="py-2 pr-4 text-right">
                    {formatCLP(item.unitPrice)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatCLP(item.discount ?? 0)}
                  </td>
                  <td className="py-2 text-right font-medium">
                    {formatCLP(item.lineTotal ?? item.quantity * item.unitPrice - (item.discount ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Neto</span>
              <span className="font-medium">
                {formatCLP(invoice.netAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">IVA</span>
              <span className="font-medium">
                {formatCLP(invoice.ivaAmount)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-bold">
              <span>Total</span>
              <span>{formatCLP(invoice.totalAmount)}</span>
            </div>
            {canPay && (
              <div className="flex justify-between text-green-600">
                <span>Pagado</span>
                <span>{formatCLP(invoice.paidAmount ?? 0)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payments list */}
      {invoice.payments && invoice.payments.length > 0 && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
            Pagos registrados
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium uppercase text-gray-500">
                <th className="pb-2 pr-4">Fecha</th>
                <th className="pb-2 pr-4">Método</th>
                <th className="pb-2 pr-4 text-right">Monto</th>
                <th className="pb-2">Referencia</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((p: any) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{formatDate(p.paidAt)}</td>
                  <td className="py-2 pr-4">{p.paymentMethod}</td>
                  <td className="py-2 pr-4 text-right font-medium">
                    {formatCLP(p.amount)}
                  </td>
                  <td className="py-2 text-gray-500">{p.reference ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">Registrar pago</h3>
            <form onSubmit={handlePayment} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Monto (pendiente: {formatCLP(remaining)})
                </label>
                <input
                  type="number"
                  min={1}
                  max={remaining}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  className="w-full rounded-lg border px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Método de pago
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm"
                >
                  <option value="TRANSFER">Transferencia</option>
                  <option value="CASH">Efectivo</option>
                  <option value="CHECK">Cheque</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Referencia (opcional)
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Nro. de transacción, etc."
                  className="w-full rounded-lg border px-3 py-2.5 text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPayment(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={registerPayment.isPending}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {registerPayment.isPending ? "Guardando…" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SiiStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    DRAFT: { label: "Borrador", color: "bg-gray-100 text-gray-800" },
    PENDING: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800" },
    SENT: { label: "Enviado", color: "bg-blue-100 text-blue-800" },
    ACCEPTED: { label: "Aceptado", color: "bg-green-100 text-green-800" },
    REJECTED: { label: "Rechazado", color: "bg-red-100 text-red-800" },
    OBJECTED: { label: "Reparos", color: "bg-orange-100 text-orange-800" },
  };

  const { label, color } = config[status] ?? {
    label: status,
    color: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}
    >
      {label}
    </span>
  );
}
