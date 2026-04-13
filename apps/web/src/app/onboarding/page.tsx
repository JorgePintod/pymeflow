"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Building2,
  CreditCard,
  Shield,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

const STEPS = [
  { label: "Empresa", icon: Building2 },
  { label: "Plan", icon: CreditCard },
  { label: "SII", icon: Shield },
  { label: "Listo", icon: CheckCircle },
];

const PLANS = [
  {
    id: "FREE",
    name: "Gratuito",
    price: "$0",
    period: "/mes",
    features: ["20 DTE/mes", "Facturación básica", "1 usuario", "Dashboard"],
    highlighted: false,
  },
  {
    id: "STARTER",
    name: "Starter",
    price: "$4.990",
    period: "/mes",
    features: ["100 DTE/mes", "Cobranza automática", "3 usuarios", "Flujo de caja"],
    highlighted: false,
  },
  {
    id: "PROFESSIONAL",
    name: "Profesional",
    price: "$9.990",
    period: "/mes",
    features: ["DTE ilimitados", "Integración SII completa", "10 usuarios", "Reportes avanzados"],
    highlighted: true,
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: "$29.990",
    period: "/mes",
    features: ["DTE ilimitados", "API personalizada", "Usuarios ilimitados", "Soporte dedicado"],
    highlighted: false,
  },
];

export default function OnboardingPage() {
  const { tenant, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState("FREE");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const handleSelectPlan = async () => {
    if (selectedPlan !== "FREE") {
      try {
        setIsSubmitting(true);
        const res = await api.createCheckout(selectedPlan);
        if (res.data.url) {
          window.location.href = res.data.url;
          return;
        }
      } catch {
        // If Stripe not configured, continue anyway
      } finally {
        setIsSubmitting(false);
      }
    }
    setStep(2);
  };

  const handleFinish = () => {
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <h1 className="text-xl font-bold text-brand-700">PymeFlow</h1>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                i < step ? "bg-brand-600 text-white" :
                i === step ? "bg-brand-100 text-brand-700 ring-2 ring-brand-600" :
                "bg-gray-200 text-gray-500",
              )}>
                {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn(
                "hidden text-sm sm:block",
                i === step ? "font-medium text-gray-900" : "text-gray-500",
              )}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={cn(
                  "h-0.5 w-8",
                  i < step ? "bg-brand-600" : "bg-gray-200",
                )} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          {step === 0 && (
            <StepCompanyInfo
              tenant={tenant}
              onNext={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <StepPlanSelection
              selectedPlan={selectedPlan}
              onSelect={setSelectedPlan}
              onNext={handleSelectPlan}
              onBack={() => setStep(0)}
              isSubmitting={isSubmitting}
            />
          )}
          {step === 2 && (
            <StepSiiConfig
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepComplete onFinish={handleFinish} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Company Info (read-only, data from register) ─

function StepCompanyInfo({ tenant, onNext }: {
  tenant: { businessName: string; rut: string; plan: string } | null;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Datos de tu empresa</h2>
        <p className="mt-1 text-sm text-gray-500">
          Estos datos se configuraron al registrarte. Puedes editarlos después en Configuración.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InfoField label="Razón Social" value={tenant?.businessName} />
        <InfoField label="RUT" value={tenant?.rut} />
        <InfoField label="Giro" value="No configurado" />
        <InfoField label="Región" value="No configurada" />
      </div>

      <div className="flex justify-end">
        <button onClick={onNext} className="flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
          Continuar <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-sm text-gray-900">{value || "—"}</p>
    </div>
  );
}

// ─── Step 2: Plan Selection ──────────────────────────────

function StepPlanSelection({ selectedPlan, onSelect, onNext, onBack, isSubmitting }: {
  selectedPlan: string;
  onSelect: (plan: string) => void;
  onNext: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Elige tu plan</h2>
        <p className="mt-1 text-sm text-gray-500">
          Comienza gratis y actualiza cuando lo necesites.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            className={cn(
              "rounded-lg border-2 p-4 text-left transition",
              selectedPlan === plan.id
                ? "border-brand-600 bg-brand-50"
                : "border-gray-200 hover:border-gray-300",
              plan.highlighted && selectedPlan !== plan.id && "border-brand-200",
            )}
          >
            {plan.highlighted && (
              <span className="mb-2 inline-block rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                Recomendado
              </span>
            )}
            <p className="text-lg font-semibold text-gray-900">{plan.name}</p>
            <p className="mt-1">
              <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
              <span className="text-sm text-gray-500">{plan.period}</span>
            </p>
            <ul className="mt-3 space-y-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="h-3.5 w-3.5 text-brand-600" />
                  {f}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" /> Atrás
        </button>
        <button
          onClick={onNext}
          disabled={isSubmitting}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isSubmitting ? "Procesando..." : selectedPlan === "FREE" ? "Continuar gratis" : "Suscribirse"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: SII Config ─────────────────────────────────

function StepSiiConfig({ onNext, onBack }: {
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Configuración SII</h2>
        <p className="mt-1 text-sm text-gray-500">
          Puedes configurar la conexión al SII ahora o hacerlo después desde el menú SII.
        </p>
      </div>

      <div className="rounded-lg bg-blue-50 p-4">
        <h3 className="text-sm font-semibold text-blue-800">¿Qué necesitas?</h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-700">
          <li>• Certificado digital (.p12) — Obtenerlo en www.esign.cl o CertificadoDigital.com</li>
          <li>• CAF (Código de Autorización de Folios) — Descárgalo desde www.sii.cl</li>
          <li>• Resolución de autorización del SII</li>
        </ul>
      </div>

      <div className="rounded-lg border bg-gray-50 p-6 text-center">
        <Shield className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-3 text-sm text-gray-600">
          Podrás subir tu certificado y CAF en la sección <strong>SII</strong> del dashboard.
        </p>
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" /> Atrás
        </button>
        <button onClick={onNext} className="flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
          Continuar <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 4: Complete ────────────────────────────────────

function StepComplete({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle className="h-8 w-8 text-green-600" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-gray-900">¡Todo listo!</h2>
        <p className="mt-2 text-sm text-gray-500">
          Tu cuenta está configurada. Ya puedes empezar a facturar.
        </p>
      </div>

      <div className="mx-auto max-w-sm space-y-2 text-left">
        <Tip text="Crea tu primer cliente en la sección Clientes" />
        <Tip text="Emite tu primera factura electrónica" />
        <Tip text="Configura la cobranza automática" />
        <Tip text="Revisa tu flujo de caja proyectado" />
      </div>

      <button
        onClick={onFinish}
        className="rounded-lg bg-brand-600 px-8 py-3 text-sm font-medium text-white hover:bg-brand-700"
      >
        Ir al Dashboard
      </button>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-3">
      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
      <span className="text-sm text-gray-700">{text}</span>
    </div>
  );
}
