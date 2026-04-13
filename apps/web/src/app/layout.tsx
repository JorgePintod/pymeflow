import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";

export const metadata: Metadata = {
  title: "PymeFlow — Facturación inteligente para PYMEs chilenas",
  description:
    "Gestiona facturas electrónicas, cobranza automática y flujo de caja desde una sola plataforma.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PymeFlow",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="min-h-screen bg-gray-50 antialiased">
        <Providers>
          {children}
          <PwaInstallBanner />
        </Providers>
      </body>
    </html>
  );
}
