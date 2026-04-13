"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Upload,
  Trash2,
  FileText,
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import type { SiiCertificateInfo, CafRange, SiiConfig } from "@/lib/api";

export default function SiiPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"config" | "certificate" | "caf">("config");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Integración SII</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configuración para emisión electrónica de documentos tributarios
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: "config" as const, label: "Configuración", icon: Settings },
            { key: "certificate" as const, label: "Certificado Digital", icon: Shield },
            { key: "caf" as const, label: "Folios (CAF)", icon: FileText },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium ${
                activeTab === key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "config" && <SiiConfigSection />}
      {activeTab === "certificate" && <CertificateSection />}
      {activeTab === "caf" && <CafSection />}
    </div>
  );
}

// ─── Config Section ────────────────────────────────────────

function SiiConfigSection() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sii-config"],
    queryFn: api.getSiiConfig,
  });

  const config = data?.data;

  const [form, setForm] = useState({
    siiEnvironment: "",
    siiResolution: "",
    siiResolutionDate: "",
    economicActivity: "",
    address: "",
    commune: "",
  });

  const [initialized, setInitialized] = useState(false);

  // Initialize form when data loads
  if (config && !initialized) {
    setForm({
      siiEnvironment: config.siiEnvironment || "CERTIFICATION",
      siiResolution: config.siiResolution || "",
      siiResolutionDate: config.siiResolutionDate?.split("T")[0] || "",
      economicActivity: config.economicActivity || "",
      address: config.address || "",
      commune: config.commune || "",
    });
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: (data: Partial<SiiConfig>) => api.updateSiiConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sii-config"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      siiEnvironment: form.siiEnvironment,
      siiResolution: form.siiResolution || null,
      siiResolutionDate: form.siiResolutionDate || null,
      economicActivity: form.economicActivity || null,
      address: form.address || null,
      commune: form.commune || null,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuración SII</h2>

      {/* Status summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          {config?.hasCertificate ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
          <div>
            <p className="text-sm font-medium text-gray-900">Certificado</p>
            <p className="text-xs text-gray-500">
              {config?.hasCertificate ? "Configurado" : "No configurado"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <div
            className={`h-3 w-3 rounded-full ${
              config?.siiEnvironment === "PRODUCTION" ? "bg-green-500" : "bg-yellow-500"
            }`}
          />
          <div>
            <p className="text-sm font-medium text-gray-900">Ambiente</p>
            <p className="text-xs text-gray-500">
              {config?.siiEnvironment === "PRODUCTION" ? "Producción" : "Certificación"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          {config?.siiResolution ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          )}
          <div>
            <p className="text-sm font-medium text-gray-900">Resolución</p>
            <p className="text-xs text-gray-500">
              {config?.siiResolution ? `Nro. ${config.siiResolution}` : "No configurada"}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Ambiente SII</label>
          <select
            value={form.siiEnvironment}
            onChange={(e) => setForm((f) => ({ ...f, siiEnvironment: e.target.value }))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            <option value="CERTIFICATION">Certificación (maullin.sii.cl)</option>
            <option value="PRODUCTION">Producción (palena.sii.cl)</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Nro. Resolución SII
            </label>
            <input
              type="text"
              value={form.siiResolution}
              onChange={(e) => setForm((f) => ({ ...f, siiResolution: e.target.value }))}
              placeholder="Ej: 80"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Fecha Resolución
            </label>
            <input
              type="date"
              value={form.siiResolutionDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, siiResolutionDate: e.target.value }))
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Actividad Económica (Giro)
          </label>
          <input
            type="text"
            value={form.economicActivity}
            onChange={(e) =>
              setForm((f) => ({ ...f, economicActivity: e.target.value }))
            }
            placeholder="Ej: Servicios de Desarrollo de Software"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Dirección</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Ej: Av. Providencia 1234"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Comuna</label>
            <input
              type="text"
              value={form.commune}
              onChange={(e) => setForm((f) => ({ ...f, commune: e.target.value }))}
              placeholder="Ej: Providencia"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateMutation.isPending ? "Guardando..." : "Guardar Configuración"}
          </button>
          {updateMutation.isSuccess && (
            <span className="ml-3 text-sm text-green-600">Guardado exitosamente</span>
          )}
          {updateMutation.isError && (
            <span className="ml-3 text-sm text-red-600">Error al guardar</span>
          )}
        </div>
      </form>
    </div>
  );
}

// ─── Certificate Section ───────────────────────────────────

function CertificateSection() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [uploadError, setUploadError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sii-certificate"],
    queryFn: api.getSiiCertificate,
  });

  const certInfo = data?.data;

  const uploadMutation = useMutation({
    mutationFn: (data: { p12Base64: string; password: string }) =>
      api.uploadSiiCertificate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sii-certificate"] });
      queryClient.invalidateQueries({ queryKey: ["sii-config"] });
      setPassword("");
      setUploadError("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : "Error al cargar certificado");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSiiCertificate(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sii-certificate"] });
      queryClient.invalidateQueries({ queryKey: ["sii-config"] });
    },
  });

  const handleUpload = useCallback(() => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !password) {
      setUploadError("Seleccione un archivo .p12 e ingrese la contraseña");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (base64) {
        uploadMutation.mutate({ p12Base64: base64, password });
      }
    };
    reader.readAsDataURL(file);
  }, [password, uploadMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current certificate info */}
      {certInfo && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Certificado Actual</h2>
            <button
              onClick={() => {
                if (confirm("¿Está seguro de eliminar el certificado digital?")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Titular</p>
              <p className="text-sm font-medium text-gray-900">
                {certInfo.subject.commonName}
              </p>
            </div>
            {certInfo.subject.serialNumber && (
              <div>
                <p className="text-xs text-gray-500">RUT</p>
                <p className="text-sm font-medium text-gray-900">
                  {certInfo.subject.serialNumber}
                </p>
              </div>
            )}
            {certInfo.subject.organization && (
              <div>
                <p className="text-xs text-gray-500">Organización</p>
                <p className="text-sm font-medium text-gray-900">
                  {certInfo.subject.organization}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500">Emisor</p>
              <p className="text-sm font-medium text-gray-900">{certInfo.issuer}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Válido desde</p>
              <p className="text-sm text-gray-900">
                {new Date(certInfo.validFrom).toLocaleDateString("es-CL")}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Válido hasta</p>
              <p className="text-sm text-gray-900">
                {new Date(certInfo.validTo).toLocaleDateString("es-CL")}
              </p>
            </div>
          </div>

          <div className="mt-4">
            {certInfo.isValid ? (
              <span className="inline-flex items-center gap-1 text-sm text-green-700 bg-green-50 px-2 py-1 rounded">
                <CheckCircle className="h-4 w-4" /> Certificado válido
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-red-700 bg-red-50 px-2 py-1 rounded">
                <XCircle className="h-4 w-4" /> Certificado expirado
              </span>
            )}
          </div>
        </div>
      )}

      {/* Upload form */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {certInfo ? "Reemplazar Certificado" : "Cargar Certificado Digital"}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Suba su archivo .p12 (certificado digital) emitido por una entidad certificadora
          autorizada. La contraseña se encripta antes de almacenar.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Archivo .p12
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".p12,.pfx"
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Contraseña del certificado
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ingrese la contraseña"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>

          {uploadError && (
            <p className="text-sm text-red-600">{uploadError}</p>
          )}

          <button
            onClick={handleUpload}
            disabled={uploadMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploadMutation.isPending ? "Cargando..." : "Cargar Certificado"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CAF Section ───────────────────────────────────────────

function CafSection() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["caf-ranges"],
    queryFn: api.getCafRanges,
  });

  const ranges = data?.data ?? [];

  const uploadMutation = useMutation({
    mutationFn: (data: { cafXml: string }) => api.uploadCaf(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caf-ranges"] });
      setUploadError("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : "Error al cargar CAF");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.deleteCafRange(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caf-ranges"] });
    },
  });

  const handleUpload = useCallback(() => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError("Seleccione un archivo XML de CAF");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const cafXml = reader.result as string;
      uploadMutation.mutate({ cafXml });
    };
    reader.readAsText(file);
  }, [uploadMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const docTypeLabels: Record<string, string> = {
    FACTURA_ELECTRONICA: "Factura Electrónica",
    FACTURA_EXENTA: "Factura Exenta",
    NOTA_CREDITO: "Nota de Crédito",
    NOTA_DEBITO: "Nota de Débito",
    GUIA_DESPACHO: "Guía de Despacho",
    BOLETA_ELECTRONICA: "Boleta Electrónica",
  };

  return (
    <div className="space-y-6">
      {/* Upload form */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Cargar Folios (CAF)
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Suba el archivo XML de Código de Autorización de Folios obtenido desde el portal
          del SII. Cada archivo autoriza un rango de folios para un tipo de documento.
        </p>

        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700">
              Archivo CAF (.xml)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={uploadMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Cargar CAF
          </button>
        </div>

        {uploadError && (
          <p className="mt-2 text-sm text-red-600">{uploadError}</p>
        )}
      </div>

      {/* CAF ranges table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Rangos de Folios</h2>
        </div>

        {ranges.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p className="text-sm">No hay rangos de folios cargados</p>
            <p className="text-xs text-gray-400 mt-1">
              Descargue los CAF desde el portal MiPyme del SII
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tipo Doc.
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Rango
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Siguiente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Disponibles
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Ambiente
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ranges.map((range) => {
                  const available = range.folioEnd - range.nextFolio + 1;
                  const total = range.folioEnd - range.folioStart + 1;
                  const usagePercent = ((total - available) / total) * 100;

                  return (
                    <tr key={range.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {docTypeLabels[range.documentType] || range.documentType}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {range.folioStart} – {range.folioEnd}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                        {range.nextFolio}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                usagePercent > 90
                                  ? "bg-red-500"
                                  : usagePercent > 70
                                    ? "bg-yellow-500"
                                    : "bg-green-500"
                              }`}
                              style={{ width: `${Math.min(usagePercent, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-500">{available}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {range.isExhausted ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Agotado
                          </span>
                        ) : range.isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {range.environment === "PRODUCTION" ? "Producción" : "Certificación"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {range.isActive && !range.isExhausted && (
                          <button
                            onClick={() => {
                              if (confirm("¿Desactivar este rango de folios?")) {
                                deactivateMutation.mutate(range.id);
                              }
                            }}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Desactivar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
