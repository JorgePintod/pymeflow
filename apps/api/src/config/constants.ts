/**
 * Constantes globales de la aplicación PymeFlow.
 * Valores tributarios, configuración SII y límites del sistema.
 */

/** Tasa de IVA vigente en Chile (19%) */
export const IVA_RATE = 0.19;

/** Límites de documentos por plan (DTE emitidos por mes) */
export const PLAN_LIMITS = {
  FREE: 20,
  STARTER: 100,
  PROFESSIONAL: Infinity,
  ENTERPRISE: Infinity,
} as const;

/** Precios de los planes en CLP */
export const PLAN_PRICES_CLP = {
  FREE: 0,
  STARTER: 4990,
  PROFESSIONAL: 9990,
  ENTERPRISE: 29990,
} as const;

/** Tipos de documentos SII y sus códigos numéricos */
export const SII_DOCUMENT_TYPES = {
  FACTURA_ELECTRONICA: 33,
  BOLETA_ELECTRONICA: 39,
  NOTA_CREDITO_ELECTRONICA: 61,
  NOTA_DEBITO_ELECTRONICA: 56,
  LIQUIDACION_FACTURA: 43,
  FACTURA_EXENTA: 34,
} as const;

/** Configuración de paginación por defecto */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/** Configuración de rate limiting por endpoint */
export const RATE_LIMITS = {
  /** Login: 5 intentos por IP cada 15 minutos */
  LOGIN: { max: 5, timeWindow: "15 minutes" },
  /** Register: 3 intentos por IP cada hora */
  REGISTER: { max: 3, timeWindow: "1 hour" },
  /** API general: 100 req/min */
  GENERAL: { max: 100, timeWindow: "1 minute" },
} as const;

/** Regiones de Chile */
export const REGIONES_CHILE = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana",
  "O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén",
  "Magallanes",
] as const;
