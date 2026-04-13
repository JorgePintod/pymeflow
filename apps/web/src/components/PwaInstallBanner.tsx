"use client";

import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosBanner, setShowIosBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed this session
    if (sessionStorage.getItem("pwa-banner-dismissed")) {
      setDismissed(true);
      return;
    }

    // Android / Desktop Chrome
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari detection
    const isIos =
      /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) &&
      !("standalone" in window.navigator && (window.navigator as any).standalone);
    const isInStandalone =
      window.matchMedia("(display-mode: standalone)").matches;

    if (isIos && !isInStandalone) {
      setShowIosBanner(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosBanner(false);
    sessionStorage.setItem("pwa-banner-dismissed", "1");
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    dismiss();
  }

  if (dismissed) return null;

  // Android / Desktop prompt
  if (deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-2xl border bg-white p-4 shadow-xl sm:left-auto">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-brand-100 p-2">
            <Download className="h-5 w-5 text-brand-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Instalar PymeFlow
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Acceso rápido desde tu pantalla de inicio
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleInstall}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                Instalar
              </button>
              <button
                onClick={dismiss}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
              >
                Ahora no
              </button>
            </div>
          </div>
          <button onClick={dismiss} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // iOS banner
  if (showIosBanner) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-2xl border bg-white p-4 shadow-xl sm:left-auto">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-brand-100 p-2">
            <Download className="h-5 w-5 text-brand-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Instalar PymeFlow
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Toca <strong>Compartir</strong> y luego{" "}
              <strong>&quot;Agregar a pantalla de inicio&quot;</strong>
            </p>
            <button
              onClick={dismiss}
              className="mt-2 text-xs font-medium text-gray-500 hover:text-gray-700"
            >
              Entendido
            </button>
          </div>
          <button onClick={dismiss} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
