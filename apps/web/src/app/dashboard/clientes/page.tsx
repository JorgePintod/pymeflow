"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatCLP } from "@/lib/utils";
import { Plus, Search, X, MoreVertical, UserCheck, UserX, Eye } from "lucide-react";
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

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"" | "true" | "false">("" );
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Auto-abrir modal de edición si viene ?editId=... en la URL
  useEffect(() => {
    const urlEditId = searchParams.get("editId");
    if (urlEditId) {
      setEditId(urlEditId);
      setShowModal(true);
    }
  }, [searchParams]);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (filterActive) params.set("isActive", filterActive);
  params.set("page", String(page));
  params.set("limit", "20");

  const { data, isLoading } = useQuery({
    queryKey: ["clients", search, filterActive, page],
    queryFn: () => api.getClients(params.toString()),
  });

  const clients = (data?.data ?? []) as Client[];
  const pagination = data?.pagination;

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.deleteClient(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => api.reactivateClient(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  function openNew() {
    setEditId(null);
    setShowModal(true);
  }

  function openEdit(id: string) {
    setEditId(id);
    setShowModal(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o RUT..."
            value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full rounded-lg border pl-9 pr-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
        />
        </div>
        <select
          value={filterActive}
          onChange={(e) => { setFilterActive(e.target.value as "" | "true" | "false"); setPage(1); }}
          className="rounded-lg border px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/60 text-left text-xs font-medium uppercase text-gray-500">
                <th className="px-4 py-3">Razón social</th>
                <th className="px-4 py-3">RUT</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Facturado</th>
                <th className="px-4 py-3 text-right">Pagado</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Cargando…
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No se encontraron clientes.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link
                        href={`/dashboard/clientes/${c.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {c.businessName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.rut}</td>
                    <td className="px-4 py-3 text-gray-500">{c.email}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCLP(c.totalInvoiced)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCLP(c.totalPaid)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          c.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {c.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ClientActions
                        client={c}
                        onEdit={() => openEdit(c.id)}
                        onDeactivate={() => deactivateMutation.mutate(c.id)}
                        onReactivate={() => reactivateMutation.mutate(c.id)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-xs text-gray-500">
              {pagination.total} clientes · Página {pagination.page} de{" "}
              {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border px-3 py-1 text-xs disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination.hasMore}
                className="rounded border px-3 py-1 text-xs disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <ClientModal
          clientId={editId}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            queryClient.invalidateQueries({ queryKey: ["clients"] });
          }}
        />
      )}
    </div>
  );
}

/* ────────────── Client Form Modal ────────────── */

function ClientModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!clientId;

  const { data: existingData } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.getClient(clientId!),
    enabled: isEdit,
  });

  const existing = existingData?.data as Record<string, unknown> | undefined;

  const [form, setForm] = useState({
    businessName: "",
    rut: "",
    email: "",
    phone: "",
    address: "",
    activity: "",
    paymentDays: "30",
    creditLimit: "",
  });
  const [initialized, setInitialized] = useState(!isEdit);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate form when editing
  if (isEdit && existing && !initialized) {
    setForm({
      businessName: String(existing.businessName ?? ""),
      rut: String(existing.rut ?? ""),
      email: String(existing.email ?? ""),
      phone: String(existing.phone ?? ""),
      address: String(existing.address ?? ""),
      activity: String(existing.activity ?? ""),
      paymentDays: String(existing.paymentDays ?? "30"),
      creditLimit: existing.creditLimit != null ? String(existing.creditLimit) : "",
    });
    setInitialized(true);
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload: Record<string, unknown> = {
      businessName: form.businessName,
      rut: form.rut,
      email: form.email,
      paymentDays: Number(form.paymentDays),
    };
    if (form.phone) payload.phone = form.phone;
    if (form.address) payload.address = form.address;
    if (form.activity) payload.activity = form.activity;
    if (form.creditLimit !== "") payload.creditLimit = Number(form.creditLimit);

    try {
      if (isEdit) {
        await api.updateClient(clientId!, payload);
      } else {
        await api.createClient(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {isEdit ? "Editar cliente" : "Nuevo cliente"}
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Razón social *
              </label>
              <input
                type="text"
                value={form.businessName}
                onChange={(e) => update("businessName", e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                RUT *
              </label>
              <input
                type="text"
                placeholder="12.345.678-9"
                value={form.rut}
                onChange={(e) => update("rut", e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email *
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
                className="w-full rounded-lg border px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Teléfono
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Días de pago
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={form.paymentDays}
                onChange={(e) => update("paymentDays", e.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Límite de crédito (CLP)
              </label>
              <input
                type="number"
                min={0}
                value={form.creditLimit}
                onChange={(e) => update("creditLimit", e.target.value)}
                placeholder="Sin límite"
                className="w-full rounded-lg border px-3 py-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Dirección
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Giro / Actividad
              </label>
              <input
                type="text"
                value={form.activity}
                onChange={(e) => update("activity", e.target.value)}
                className="w-full rounded-lg border px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClientActions({
  client,
  onEdit,
  onDeactivate,
  onReactivate,
}: {
  client: Client;
  onEdit: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 hover:bg-gray-100"
        title="Acciones"
      >
        <MoreVertical className="h-4 w-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border bg-white shadow-lg">
          <button
            onClick={() => { setOpen(false); onEdit(); }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Eye className="h-4 w-4" /> Editar
          </button>
          {client.isActive ? (
            <button
              onClick={() => { setOpen(false); onDeactivate(); }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <UserX className="h-4 w-4" /> Desactivar
            </button>
          ) : (
            <button
              onClick={() => { setOpen(false); onReactivate(); }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-green-600 hover:bg-green-50"
            >
              <UserCheck className="h-4 w-4" /> Reactivar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
