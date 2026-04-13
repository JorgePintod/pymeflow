"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CollectionSettings } from "@/lib/api";
import { formatCLP, formatDate } from "@/lib/utils";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Bell, Play, Mail, MessageSquare, CheckCircle, XCircle, Loader2 } from "lucide-react";

const SUGGESTED_DAYS = [1, 3, 5, 7, 14, 30, 60, 90];

const CHANNEL_LABELS: Record<string, { label: string; icon: typeof Mail }> = {
  EMAIL: { label: "Email", icon: Mail },
  WHATSAPP: { label: "WhatsApp", icon: MessageSquare },
};

const STATUS_COLORS: Record<string, string> = {
  SENT: "bg-green-100 text-green-700",
  DELIVERED: "bg-blue-100 text-blue-700",
  FAILED: "bg-red-100 text-red-700",
  BOUNCED: "bg-yellow-100 text-yellow-700",
};

export default function CobranzaPage() {
  const queryClient = useQueryClient();
  const [logsPage, setLogsPage] = useState(1);
  const [channelFilter, setChannelFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const push = usePushNotifications();

  // Settings
  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ["collectionSettings"],
    queryFn: () => api.getCollectionSettings(),
  });
  const settings = settingsData?.data;

  // Logs
  const logsParams = new URLSearchParams();
  logsParams.set("page", String(logsPage));
  logsParams.set("limit", "15");
  if (channelFilter) logsParams.set("channel", channelFilter);
  if (statusFilter) logsParams.set("status", statusFilter);

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["collectionLogs", logsPage, channelFilter, statusFilter],
    queryFn: () => api.getCollectionLogs(logsParams.toString()),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs = (logsData?.data ?? []) as any[];
  const logsPagination = logsData?.pagination;

  // Mutations
  const updateSettings = useMutation({
    mutationFn: (data: Partial<CollectionSettings>) => api.updateCollectionSettings(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collectionSettings"] }),
  });

  const runCollection = useMutation({
    mutationFn: () => api.runCollections(),
  });

  const toggleDay = (day: number) => {
    if (!settings) return;
    const current = settings.collectionDays ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    if (next.length > 0) {
      updateSettings.mutate({ collectionDays: next });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Cobranza Automática</h1>
        <button
          onClick={() => runCollection.mutate()}
          disabled={runCollection.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {runCollection.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Ejecutar ahora
        </button>
      </div>

      {runCollection.isSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          Cobranza ejecutada correctamente. Los recordatorios se están enviando.
        </div>
      )}

      {/* Configuration Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cobranza Settings */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Configuración</h2>

          {settingsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Toggle enabled */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Recordatorios automáticos</p>
                  <p className="text-xs text-gray-500">
                    Envía emails a clientes con facturas vencidas
                  </p>
                </div>
                <button
                  onClick={() =>
                    updateSettings.mutate({ collectionEnabled: !settings?.collectionEnabled })
                  }
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    settings?.collectionEnabled ? "bg-brand-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      settings?.collectionEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Collection days */}
              <div>
                <p className="mb-2 text-sm font-medium text-gray-900">
                  Días de recordatorio (después del vencimiento)
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_DAYS.map((day) => {
                    const isSelected = settings?.collectionDays?.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          isSelected
                            ? "bg-brand-100 text-brand-700 ring-1 ring-brand-300"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {day}d
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  Seleccionados: {settings?.collectionDays?.join(", ") ?? "ninguno"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Push Notifications */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Notificaciones Push</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Notificaciones del navegador</p>
                <p className="text-xs text-gray-500">
                  Recibe alertas cuando se envíen recordatorios
                </p>
              </div>
              {push.isSupported ? (
                <button
                  onClick={() => (push.isSubscribed ? push.unsubscribe() : push.subscribe())}
                  disabled={push.isLoading}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    push.isSubscribed ? "bg-brand-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      push.isSubscribed ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              ) : (
                <span className="text-xs text-gray-400">No soportado</span>
              )}
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-5 w-5 text-brand-600" />
                <div className="text-xs text-gray-600">
                  <p className="font-medium text-gray-900">¿Cómo funciona?</p>
                  <p className="mt-1">
                    Todos los días a las 8:00 AM se revisan las facturas vencidas. Se envían
                    recordatorios por email en los días configurados. Recibirás una notificación
                    push por cada envío.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Collection Logs */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Historial de Cobranza</h2>
          <div className="flex gap-2">
            <select
              value={channelFilter}
              onChange={(e) => {
                setChannelFilter(e.target.value);
                setLogsPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Todos los canales</option>
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setLogsPage(1);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="SENT">Enviado</option>
              <option value="DELIVERED">Entregado</option>
              <option value="FAILED">Fallido</option>
              <option value="BOUNCED">Rebotado</option>
            </select>
          </div>
        </div>

        {logsLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center text-gray-400">
            <Mail className="mb-2 h-10 w-10" />
            <p className="text-sm">No hay registros de cobranza</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Factura</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Canal</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => {
                    const channel = CHANNEL_LABELS[log.channel] ?? {
                      label: log.channel,
                      icon: Mail,
                    };
                    const ChannelIcon = channel.icon;
                    return (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          #{log.invoice?.folio ?? log.invoice?.internalRef ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {log.invoice?.client?.businessName ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-gray-600">
                            <ChannelIcon className="h-3.5 w-3.5" />
                            {channel.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[log.status] ?? "bg-gray-100 text-gray-700"}`}
                          >
                            {log.status === "SENT" || log.status === "DELIVERED" ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {logsPagination && logsPagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <p className="text-xs text-gray-500">
                  Mostrando página {logsPagination.page} de {logsPagination.totalPages} ({logsPagination.total} registros)
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                    disabled={logsPage <= 1}
                    className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setLogsPage((p) => p + 1)}
                    disabled={!logsPagination.hasMore}
                    className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
