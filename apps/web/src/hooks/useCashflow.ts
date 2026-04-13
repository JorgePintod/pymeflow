"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ─── Cashflow Hooks ──────────────────────────────────────

export function useCashflowSummary() {
  return useQuery({
    queryKey: ["cashflow", "summary"],
    queryFn: () => api.getCashflowSummary(),
  });
}

export function useCashflowEntries(params?: string) {
  return useQuery({
    queryKey: ["cashflow", "entries", params],
    queryFn: () => api.getCashflowEntries(params),
  });
}

export function useCreateCashflowEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.createCashflowEntry(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}

export function useDeleteCashflowEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteCashflowEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}

export function useSyncCashflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.syncCashflow(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashflow"] });
    },
  });
}

// ─── Expense Hooks ───────────────────────────────────────

export function useExpenses(params?: string) {
  return useQuery({
    queryKey: ["expenses", params],
    queryFn: () => api.getExpenses(params),
  });
}

export function useExpense(id: string) {
  return useQuery({
    queryKey: ["expenses", id],
    queryFn: () => api.getExpense(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useExpenseSummary() {
  return useQuery({
    queryKey: ["expenses", "summary"],
    queryFn: () => api.getExpenseSummary(),
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => api.createExpense(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) =>
      api.updateExpense(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useMarkExpensePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paidAt }: { id: string; paidAt?: string }) =>
      api.markExpensePaid(id, paidAt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

// ─── Subscription Hooks ──────────────────────────────────

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: () => api.getSubscription(),
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (plan: string) => api.createCheckout(plan),
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: () => api.createPortalSession(),
  });
}
