"use client";

import { useSubscription, useCreateCheckout, useCreatePortalSession } from "@/hooks/useCashflow";
import type { SubscriptionInfo } from "@/lib/api";
import { CreditCard, CheckCircle, Zap, Building2, ExternalLink } from "lucide-react";

const PLANS = [
  {
    id: "STARTER",
    name: "Starter",
    price: "$19.990",
    period: "/ mes",
    description: "Ideal para microempresas y trabajadores independientes",
    features: [
      "Hasta 50 facturas al mes",
      "5 clientes activos",
      "Cobranza automática por email",
      "Integración SII (producción)",
      "Soporte por email",
    ],
  },
  {
    id: "PROFESSIONAL",
    name: "Professional",
    price: "$39.990",
    period: "/ mes",
    description: "Para PYMEs en crecimiento con más clientes y volumen",
    recommended: true,
    features: [
      "Facturas ilimitadas",
      "Clientes ilimitados",
      "Cobranza por email, WhatsApp y SMS",
      "Flujo de caja con proyecciones",
      "Múltiples usuarios (hasta 5)",
      "Soporte prioritario",
    ],
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: "$79.990",
    period: "/ mes",
    description: "Para empresas medianas con necesidades avanzadas",
    features: [
      "Todo lo del plan Professional",
      "Usuarios ilimitados",
      "API personalizada",
      "Gestor de cuenta dedicado",
      "SLA de soporte 24/7",
    ],
  },
];

const PLAN_STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  trialing: "Período de prueba",
  past_due: "Pago pendiente",
  canceled: "Cancelado",
  incomplete: "Incompleto",
  unpaid: "Sin pagar",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function SuscripcionPage() {
  const { data, isLoading } = useSubscription();
  const createCheckout = useCreateCheckout();
  const createPortal = useCreatePortalSession();

  const info = data?.data as SubscriptionInfo | undefined;

  async function handleSelectPlan(planId: string) {
    try {
      const res = await createCheckout.mutateAsync(planId);
      const url = (res as unknown as { data: { url: string } })?.data?.url;
      if (url) window.location.href = url;
    } catch {
      // error manejado por React Query
    }
  }

  async function handleManageBilling() {
    try {
      const res = await createPortal.mutateAsync();
      const url = (res as unknown as { data: { url: string } })?.data?.url;
      if (url) window.location.href = url;
    } catch {
      // error manejado
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const currentPlan = info?.plan ?? "FREE";
  const sub = info?.subscription;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Suscripción y Plan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Administra tu plan, método de pago e historial de facturación.
        </p>
      </div>

      {/* Plan actual */}
      {info && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
            Tu plan actual
          </h2>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-brand-100 p-2">
                <Zap className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{currentPlan}</p>
                {sub && (
                  <p className="text-sm text-gray-500">
                    Estado:{" "}
                    <span className="font-medium">
                      {PLAN_STATUS_LABELS[sub.status] ?? sub.status}
                    </span>
                  </p>
                )}
                {sub?.currentPeriodEnd && (
                  <p className="text-sm text-gray-500">
                    Renovación: {formatDate(sub.currentPeriodEnd)}
                  </p>
                )}
                {sub?.cancelAtPeriodEnd && (
                  <p className="mt-1 text-sm font-medium text-amber-600">
                    ⚠ Se cancelará al final del período
                  </p>
                )}
              </div>
            </div>
            {info.stripeCustomerId && (
              <button
                onClick={handleManageBilling}
                disabled={createPortal.isPending}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <CreditCard className="h-4 w-4" />
                {createPortal.isPending ? "Redirigiendo..." : "Gestionar facturación"}
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Planes disponibles */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Planes disponibles
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative rounded-xl border bg-white p-6 shadow-sm ${
                  plan.recommended
                    ? "border-brand-400 ring-2 ring-brand-200"
                    : ""
                }`}
              >
                {plan.recommended && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold text-white">
                    Recomendado
                  </span>
                )}

                <div className="mb-2 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-gray-400" />
                  <h3 className="text-base font-bold text-gray-900">{plan.name}</h3>
                </div>

                <div className="mb-1 flex items-end gap-1">
                  <span className="text-2xl font-extrabold text-gray-900">{plan.price}</span>
                  <span className="mb-0.5 text-sm text-gray-400">{plan.period}</span>
                </div>

                <p className="mb-4 text-xs text-gray-500">{plan.description}</p>

                <ul className="mb-6 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <button
                    disabled
                    className="w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-500"
                  >
                    Plan actual
                  </button>
                ) : (
                  <button
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={createCheckout.isPending}
                    className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    {createCheckout.isPending ? "Redirigiendo..." : `Cambiar a ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
