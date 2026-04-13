import Link from "next/link";
import {
  FileText,
  TrendingUp,
  Shield,
  Bell,
  BarChart3,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: FileText,
    title: "Facturación Electrónica",
    description: "Emite facturas, boletas y notas de crédito integradas con el SII.",
  },
  {
    icon: TrendingUp,
    title: "Flujo de Caja",
    description: "Proyecciones a 30, 60 y 90 días. Visualiza tu salud financiera.",
  },
  {
    icon: Bell,
    title: "Cobranza Automática",
    description: "Recordatorios por email y WhatsApp para cobrar a tiempo.",
  },
  {
    icon: Shield,
    title: "Integración SII",
    description: "Envío directo al SII, certificados digitales y control de folios.",
  },
  {
    icon: BarChart3,
    title: "Control de Gastos",
    description: "Registra gastos, calcula crédito fiscal IVA automáticamente.",
  },
  {
    icon: CheckCircle,
    title: "Multi-tenant",
    description: "Gestiona múltiples empresas desde una sola plataforma.",
  },
];

const PLANS = [
  {
    name: "Gratuito",
    price: "$0",
    features: ["20 DTE/mes", "1 usuario", "Dashboard básico"],
    cta: "Comenzar gratis",
    highlighted: false,
  },
  {
    name: "Starter",
    price: "$4.990",
    features: ["100 DTE/mes", "3 usuarios", "Cobranza automática", "Flujo de caja"],
    cta: "Probar gratis",
    highlighted: false,
  },
  {
    name: "Profesional",
    price: "$9.990",
    features: ["DTE ilimitados", "10 usuarios", "SII completo", "Reportes avanzados"],
    cta: "Probar gratis",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$29.990",
    features: ["DTE ilimitados", "Usuarios ilimitados", "API personalizada", "Soporte dedicado"],
    cta: "Contactar ventas",
    highlighted: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <span className="text-xl font-bold text-brand-700">PymeFlow</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Iniciar sesión
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Registrarse
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
          Facturación electrónica
          <span className="block text-brand-600">para PyMEs chilenas</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
          Emite DTE al SII, controla tu flujo de caja, cobra automáticamente y gestiona tus gastos.
          Todo en una sola plataforma diseñada para Chile.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            Comenzar gratis <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#pricing"
            className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Ver planes
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Todo lo que necesitas para facturar
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
            Desde la emisión del DTE hasta la cobranza, PymeFlow cubre todo el ciclo de facturación.
          </p>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border bg-white p-6">
                <f.icon className="h-8 w-8 text-brand-600" />
                <h3 className="mt-4 text-lg font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Planes simples y transparentes
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-gray-600">
            Sin costos ocultos. Precios en pesos chilenos.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-lg border-2 p-6 ${
                  plan.highlighted
                    ? "border-brand-600 shadow-lg"
                    : "border-gray-200"
                }`}
              >
                {plan.highlighted && (
                  <span className="mb-3 inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white">
                    Más popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <p className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-sm text-gray-500">/mes</span>
                </p>
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle className="h-4 w-4 text-brand-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`mt-6 block rounded-lg px-4 py-2.5 text-center text-sm font-medium ${
                    plan.highlighted
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50 py-8">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} PymeFlow. Facturación electrónica para PyMEs chilenas.
          </p>
        </div>
      </footer>
    </div>
  );
}
