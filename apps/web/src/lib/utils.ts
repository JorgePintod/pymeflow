import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Borrador", color: "bg-gray-100 text-gray-700" },
  ISSUED: { label: "Emitida", color: "bg-blue-100 text-blue-700" },
  SENT: { label: "Enviada", color: "bg-indigo-100 text-indigo-700" },
  PARTIAL: { label: "Pago parcial", color: "bg-yellow-100 text-yellow-700" },
  PAID: { label: "Pagada", color: "bg-green-100 text-green-700" },
  OVERDUE: { label: "Vencida", color: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Anulada", color: "bg-gray-200 text-gray-500" },
};

export function getInvoiceStatus(status: string) {
  return STATUS_MAP[status] ?? { label: status, color: "bg-gray-100 text-gray-700" };
}
