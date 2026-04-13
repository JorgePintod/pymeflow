"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCreateInvoice, useIssueInvoice } from "@/hooks/useInvoices";
import { api } from "@/lib/api";
import { Trash2, Plus } from "lucide-react";

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  code: string;
}

const emptyItem: LineItem = {
  description: "",
  quantity: 1,
  unitPrice: 0,
  discount: 0,
  code: "",
};

export default function NewInvoicePage() {
  const router = useRouter();
  const createInvoice = useCreateInvoice();
  const issueInvoice = useIssueInvoice();

  const { data: clientsData } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => api.getClients("limit=100"),
  });

  const [clientId, setClientId] = useState("");
  const [documentType, setDocumentType] = useState("FACTURA_ELECTRONICA");
  const [creditDays, setCreditDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ ...emptyItem }]);
  const [error, setError] = useState("");
  const [issuing, setIssuing] = useState(false);

  const clients = (clientsData?.data ?? []) as Array<{
    id: string;
    businessName: string;
    rut: string;
    paymentDays: number;
  }>;

  function handleClientChange(id: string) {
    setClientId(id);
    const client = clients.find((c) => c.id === id);
    if (client) setCreditDays(client.paymentDays);
  }

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, [field]: value };
      return copy;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  // Calcular subtotales
  const netAmount = items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPrice - item.discount),
    0,
  );
  const isExempt = documentType === "FACTURA_EXENTA";
  const ivaAmount = isExempt ? 0 : Math.round(netAmount * 0.19);
  const totalAmount = netAmount + ivaAmount;

  function buildPayload() {
    return {
      clientId,
      documentType,
      creditDays,
      notes: notes || undefined,
      items: items.map((i) => ({
        code: i.code || undefined,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
      })),
    };
  }

  function validate(): boolean {
    if (!clientId) { setError("Selecciona un cliente"); return false; }
    if (items.some((i) => !i.description || i.unitPrice <= 0)) {
      setError("Todos los ítems deben tener descripción y precio");
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    try {
      await createInvoice.mutateAsync(buildPayload());
      router.push("/dashboard/facturas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear factura");
    }
  }

  async function handleEmitNow() {
    setError("");
    if (!validate()) return;
    setIssuing(true);
    try {
      const res = await createInvoice.mutateAsync(buildPayload());
      const newId = (res as unknown as { data: { id: string } } | undefined)?.data?.id;
      if (newId) {
        await issueInvoice.mutateAsync(newId);
        router.push(`/dashboard/facturas/${newId}`);
      } else {
        router.push("/dashboard/facturas");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al emitir factura");
      setIssuing(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Nueva Factura</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Datos generales */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
            Datos generales
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Cliente
              </label>
              <select
                value={clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="">Seleccionar cliente...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.businessName} ({c.rut})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Tipo de documento
              </label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
              >
                <option value="FACTURA_ELECTRONICA">Factura Electrónica</option>
                <option value="BOLETA_ELECTRONICA">Boleta Electrónica</option>
                <option value="FACTURA_EXENTA">Factura Exenta</option>
                <option value="NOTA_CREDITO_ELECTRONICA">
                  Nota de Crédito
                </option>
                <option value="NOTA_DEBITO_ELECTRONICA">Nota de Débito</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Días de crédito
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={creditDays}
                onChange={(e) => setCreditDays(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notas
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas internas (opcional)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Ítems */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase text-gray-500">
              Detalle
            </h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar ítem
            </button>
          </div>

          <div className="space-y-3">
            {/* Table header */}
            <div className="hidden gap-3 text-xs font-medium uppercase text-gray-500 sm:grid sm:grid-cols-12">
              <span className="col-span-1">Cód.</span>
              <span className="col-span-4">Descripción</span>
              <span className="col-span-2 text-right">Cantidad</span>
              <span className="col-span-2 text-right">Precio unit.</span>
              <span className="col-span-2 text-right">Dcto.</span>
              <span className="col-span-1" />
            </div>

            {items.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-12 sm:gap-3 sm:border-0 sm:p-0"
              >
                <input
                  type="text"
                  placeholder="Código"
                  value={item.code}
                  onChange={(e) => updateItem(idx, "code", e.target.value)}
                  className="rounded border px-2 py-1.5 text-sm sm:col-span-1"
                />
                <input
                  type="text"
                  placeholder="Descripción del servicio o producto"
                  value={item.description}
                  onChange={(e) =>
                    updateItem(idx, "description", e.target.value)
                  }
                  required
                  className="rounded border px-2 py-1.5 text-sm sm:col-span-4"
                />
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(idx, "quantity", Number(e.target.value))
                  }
                  className="rounded border px-2 py-1.5 text-right text-sm sm:col-span-2"
                />
                <input
                  type="number"
                  min={0}
                  value={item.unitPrice}
                  onChange={(e) =>
                    updateItem(idx, "unitPrice", Number(e.target.value))
                  }
                  required
                  className="rounded border px-2 py-1.5 text-right text-sm sm:col-span-2"
                />
                <input
                  type="number"
                  min={0}
                  value={item.discount}
                  onChange={(e) =>
                    updateItem(idx, "discount", Number(e.target.value))
                  }
                  className="rounded border px-2 py-1.5 text-right text-sm sm:col-span-2"
                />
                <div className="flex items-center justify-end sm:col-span-1">
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={items.length <= 1}
                    className="rounded p-1 text-gray-400 transition hover:text-red-500 disabled:opacity-30"
                    aria-label="Eliminar ítem"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="mt-6 flex justify-end">
            <div className="w-64 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Neto</span>
                <span className="font-medium">
                  ${netAmount.toLocaleString("es-CL")}
                </span>
              </div>
              {!isExempt && (
                <div className="flex justify-between">
                  <span className="text-gray-500">IVA (19%)</span>
                  <span className="font-medium">
                    ${ivaAmount.toLocaleString("es-CL")}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 text-base font-bold">
                <span>Total</span>
                <span>${totalAmount.toLocaleString("es-CL")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={createInvoice.isPending || issuing}
            className="rounded-lg border border-brand-600 px-6 py-2.5 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50"
          >
            {createInvoice.isPending && !issuing ? "Guardando..." : "Guardar borrador"}
          </button>
          <button
            type="button"
            onClick={handleEmitNow}
            disabled={createInvoice.isPending || issuing}
            className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {issuing ? "Emitiendo..." : "Emitir ahora"}
          </button>
        </div>
      </form>
    </div>
  );
}
