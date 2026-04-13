/**
 * Utilidades específicas para el contexto tributario chileno:
 * Validación de RUT, formato CLP, valor UF, fechas tributarias.
 */

/**
 * Resultado de la validación de un RUT chileno.
 */
export interface RutValidationResult {
  isValid: boolean;
  formatted: string;     // "12.345.678-9"
  normalized: string;    // "123456789" (sin puntos ni guión, para APIs)
  body: string;          // "12345678"
  dv: string;            // "9"
}

/**
 * Valida y formatea un RUT chileno.
 * @param rut - RUT en cualquier formato (con o sin puntos/guión)
 * @returns Objeto con resultado de validación, formato y normalización
 * @example
 *   validateRut("12.345.678-5") → { isValid: true, formatted: "12.345.678-5", ... }
 *   validateRut("123456785")    → { isValid: true, formatted: "12.345.678-5", ... }
 */
export function validateRut(rut: string): RutValidationResult {
  const invalid: RutValidationResult = {
    isValid: false,
    formatted: "",
    normalized: "",
    body: "",
    dv: "",
  };

  if (!rut || typeof rut !== "string") {
    return invalid;
  }

  // Limpiar: remover puntos, guiones y espacios
  const clean = rut.replace(/[.\-\s]/g, "").toUpperCase();

  if (clean.length < 2) {
    return invalid;
  }

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  // Verificar que el cuerpo sean solo dígitos
  if (!/^\d+$/.test(body)) {
    return invalid;
  }

  // Calcular dígito verificador esperado
  const expectedDv = calculateRutDv(body);
  const isValid = expectedDv === dv;

  // Formatear con puntos y guión
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;
  const normalized = body + dv;

  return { isValid, formatted, normalized, body, dv };
}

/**
 * Calcula el dígito verificador de un RUT usando el algoritmo Módulo 11.
 * @param rutBody - Cuerpo del RUT sin DV (solo números)
 * @returns Dígito verificador como string ("0"-"9" o "K")
 */
function calculateRutDv(rutBody: string): string {
  let sum = 0;
  let multiplier = 2;

  for (let i = rutBody.length - 1; i >= 0; i--) {
    sum += parseInt(rutBody[i]!, 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = sum % 11;
  const dv = 11 - remainder;

  if (dv === 11) return "0";
  if (dv === 10) return "K";
  return dv.toString();
}

/**
 * Formatea un número como moneda chilena (CLP).
 * @param amount - Monto en pesos chilenos
 * @param options - Opciones de formato (símbolo, decimales)
 * @returns Cadena formateada
 * @example formatCLP(1500000) → "$1.500.000"
 */
export function formatCLP(
  amount: number,
  options: { showSymbol?: boolean; decimals?: number } = {}
): string {
  const { showSymbol = true, decimals = 0 } = options;

  const formatted = new Intl.NumberFormat("es-CL", {
    style: showSymbol ? "currency" : "decimal",
    currency: "CLP",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);

  return formatted;
}

/**
 * Calcula el monto de IVA a partir del monto neto.
 * Los montos se redondean a enteros (CLP no tiene centavos).
 * @param netAmount - Monto neto en CLP
 * @param ivaRate - Tasa IVA (default 0.19 = 19%)
 * @returns Objeto con ivaAmount y totalAmount redondeados
 */
export function calculateIva(
  netAmount: number,
  ivaRate: number = 0.19
): { ivaAmount: number; totalAmount: number } {
  const ivaAmount = Math.round(netAmount * ivaRate);
  const totalAmount = netAmount + ivaAmount;
  return { ivaAmount, totalAmount };
}

/**
 * Calcula la fecha de vencimiento de una factura según los días de crédito.
 * Si la fecha resultante cae en fin de semana, se mueve al lunes siguiente.
 * @param issueDate - Fecha de emisión
 * @param creditDays - Días de crédito (30, 60, 90...)
 * @returns Fecha de vencimiento ajustada a día hábil
 */
export function calculateDueDate(issueDate: Date, creditDays: number): Date {
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + creditDays);

  const dayOfWeek = dueDate.getDay();
  if (dayOfWeek === 6) dueDate.setDate(dueDate.getDate() + 2); // Sábado → Lunes
  if (dayOfWeek === 0) dueDate.setDate(dueDate.getDate() + 1); // Domingo → Lunes

  return dueDate;
}

/**
 * Obtiene el código del período tributario actual para Chile.
 * @param date - Fecha base (default: hoy)
 * @returns Período en formato "YYYYMM"
 * @example getCurrentTaxPeriod() → "202601" (enero 2026)
 */
export function getCurrentTaxPeriod(date?: Date): string {
  const d = date ?? new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

/**
 * Verifica si la fecha actual cae dentro del período de declaración de IVA.
 * En Chile, el IVA se declara entre el 1 y el 12 del mes siguiente.
 * @returns true si estamos en período de declaración
 */
export function isInIvaDeclarationPeriod(): boolean {
  const today = new Date();
  const dayOfMonth = today.getDate();
  return dayOfMonth >= 1 && dayOfMonth <= 12;
}
