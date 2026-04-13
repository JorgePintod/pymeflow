import { describe, it, expect } from "vitest";
import { validateRut, calculateIva, calculateDueDate, formatCLP, getCurrentTaxPeriod } from "../../src/shared/chile.utils.js";

describe("chile.utils", () => {
  describe("validateRut", () => {
    it("debe validar un RUT correcto con formato", () => {
      const result = validateRut("12.345.678-5");
      expect(result.isValid).toBe(true);
      expect(result.formatted).toBe("12.345.678-5");
      expect(result.normalized).toBe("123456785");
    });

    it("debe validar un RUT correcto sin formato", () => {
      const result = validateRut("123456785");
      expect(result.isValid).toBe(true);
      expect(result.formatted).toBe("12.345.678-5");
    });

    it("debe rechazar un RUT con dígito verificador incorrecto", () => {
      const result = validateRut("12.345.678-0");
      expect(result.isValid).toBe(false);
    });

    it("debe manejar RUT con K como dígito verificador", () => {
      // RUT 10.000.000-K es un RUT válido de ejemplo
      const result = validateRut("10.000.000-K");
      // Verificamos que procesa correctamente el K
      expect(result.dv).toBe("K");
    });

    it("debe rechazar string vacío", () => {
      const result = validateRut("");
      expect(result.isValid).toBe(false);
    });

    it("debe rechazar null/undefined como input", () => {
      const result = validateRut(null as unknown as string);
      expect(result.isValid).toBe(false);
    });

    it("debe rechazar RUT demasiado corto", () => {
      const result = validateRut("1");
      expect(result.isValid).toBe(false);
    });
  });

  describe("calculateIva", () => {
    it("debe calcular IVA al 19% correctamente", () => {
      const result = calculateIva(1000000);
      expect(result.ivaAmount).toBe(190000);
      expect(result.totalAmount).toBe(1190000);
    });

    it("debe redondear el IVA a entero", () => {
      const result = calculateIva(100001);
      expect(Number.isInteger(result.ivaAmount)).toBe(true);
      expect(Number.isInteger(result.totalAmount)).toBe(true);
    });

    it("debe aceptar tasa personalizada", () => {
      const result = calculateIva(1000000, 0.10);
      expect(result.ivaAmount).toBe(100000);
      expect(result.totalAmount).toBe(1100000);
    });

    it("debe manejar monto 0", () => {
      const result = calculateIva(0);
      expect(result.ivaAmount).toBe(0);
      expect(result.totalAmount).toBe(0);
    });
  });

  describe("calculateDueDate", () => {
    it("debe sumar los días de crédito correctamente", () => {
      const issueDate = new Date(2026, 0, 1); // 1 de enero 2026, Jueves
      const dueDate = calculateDueDate(issueDate, 30);
      // Jan 31 es sábado, se mueve al lunes 2 de febrero
      expect(dueDate.getDate()).toBe(2);
      expect(dueDate.getMonth()).toBe(1); // Febrero
      expect(dueDate.getDay()).toBe(1); // Lunes
    });

    it("debe mover del sábado al lunes", () => {
      // 2026-01-03 es sábado
      const issueDate = new Date(2026, 0, 1);
      const dueDate = calculateDueDate(issueDate, 2); // 3 de enero (sábado)
      expect(dueDate.getDay()).toBe(1); // Lunes
    });

    it("debe mover del domingo al lunes", () => {
      // 2026-01-04 es domingo
      const issueDate = new Date(2026, 0, 1);
      const dueDate = calculateDueDate(issueDate, 3); // 4 de enero (domingo)
      expect(dueDate.getDay()).toBe(1); // Lunes
    });
  });

  describe("formatCLP", () => {
    it("debe formatear con símbolo peso", () => {
      const result = formatCLP(1500000);
      expect(result).toContain("1.500.000");
    });

    it("debe formatear sin símbolo", () => {
      const result = formatCLP(1500000, { showSymbol: false });
      expect(result).toContain("1.500.000");
      expect(result).not.toContain("$");
    });
  });

  describe("getCurrentTaxPeriod", () => {
    it("debe retornar formato YYYYMM", () => {
      const result = getCurrentTaxPeriod(new Date(2026, 3, 15));
      expect(result).toBe("202604");
    });

    it("debe retornar mes con cero a la izquierda", () => {
      const result = getCurrentTaxPeriod(new Date(2026, 0, 1));
      expect(result).toBe("202601");
    });
  });
});
