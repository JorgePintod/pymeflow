import { describe, it, expect, vi } from "vitest";
import { DteBuilder } from "../../src/modules/sii/dte.builder.js";
import type { DteData } from "../../src/modules/sii/dte.builder.js";

// Mock constants
vi.mock("../../src/config/constants.js", () => ({
  SII_DOCUMENT_TYPES: {
    FACTURA_ELECTRONICA: 33,
    FACTURA_EXENTA: 34,
    NOTA_CREDITO: 61,
    NOTA_DEBITO: 56,
    GUIA_DESPACHO: 52,
    BOLETA_ELECTRONICA: 39,
  },
}));

const baseDteData: DteData = {
  documentType: "FACTURA_ELECTRONICA" as any,
  folio: 123,
  issueDate: new Date("2024-01-15T12:00:00Z"),
  emisor: {
    rut: "76.543.210-K",
    razonSocial: "Mi Empresa SPA",
    giro: "Desarrollo de Software",
    direccion: "Av. Providencia 1234",
    comuna: "Providencia",
  },
  receptor: {
    rut: "12.345.678-5",
    razonSocial: "Cliente Test Ltda",
    giro: "Comercio",
    direccion: "Los Leones 456",
    comuna: "Providencia",
  },
  items: [
    {
      lineNumber: 1,
      description: "Servicio de desarrollo web",
      quantity: 10,
      unit: "HRS",
      unitPrice: 50000,
      discount: 0,
      lineTotal: 500000,
      isExempt: false,
    },
    {
      lineNumber: 2,
      description: "Licencia de software mensual",
      quantity: 1,
      unitPrice: 100000,
      discount: 10000,
      lineTotal: 90000,
      isExempt: false,
    },
  ],
  netAmount: 590000,
  ivaRate: 0.19,
  ivaAmount: 112100,
  totalAmount: 702100,
  siiResolution: "80",
  siiResolutionDate: new Date("2023-08-22"),
};

describe("DteBuilder", () => {
  const builder = new DteBuilder();

  describe("buildDteXml", () => {
    it("debe generar un XML DTE válido", () => {
      const xml = builder.buildDteXml(baseDteData);

      // Verificar estructura base
      expect(xml).toContain("<DTE");
      expect(xml).toContain("<Documento");
      expect(xml).toContain("</DTE>");
    });

    it("debe incluir Encabezado con datos correctos", () => {
      const xml = builder.buildDteXml(baseDteData);

      expect(xml).toContain("<TipoDTE>33</TipoDTE>");
      expect(xml).toContain("<Folio>123</Folio>");
      expect(xml).toContain("<FchEmis>2024-01-15</FchEmis>");
    });

    it("debe incluir datos del Emisor", () => {
      const xml = builder.buildDteXml(baseDteData);

      expect(xml).toContain("<RUTEmisor>76543210-K</RUTEmisor>");
      expect(xml).toContain("<RznSoc>Mi Empresa SPA</RznSoc>");
      expect(xml).toContain("<GiroEmis>Desarrollo de Software</GiroEmis>");
      expect(xml).toContain("<DirOrigen>Av. Providencia 1234</DirOrigen>");
      expect(xml).toContain("<CmnaOrigen>Providencia</CmnaOrigen>");
    });

    it("debe incluir datos del Receptor", () => {
      const xml = builder.buildDteXml(baseDteData);

      expect(xml).toContain("<RUTRecep>12345678-5</RUTRecep>");
      expect(xml).toContain("<RznSocRecep>Cliente Test Ltda</RznSocRecep>");
      expect(xml).toContain("<GiroRecep>Comercio</GiroRecep>");
    });

    it("debe incluir Totales correctos", () => {
      const xml = builder.buildDteXml(baseDteData);

      expect(xml).toContain("<MntNeto>590000</MntNeto>");
      expect(xml).toContain("<TasaIVA>19</TasaIVA>");
      expect(xml).toContain("<IVA>112100</IVA>");
      expect(xml).toContain("<MntTotal>702100</MntTotal>");
    });

    it("debe incluir todos los items en Detalle", () => {
      const xml = builder.buildDteXml(baseDteData);

      expect(xml).toContain("<NroLinDet>1</NroLinDet>");
      expect(xml).toContain("<NmbItem>Servicio de desarrollo web</NmbItem>");
      expect(xml).toContain("<QtyItem>10</QtyItem>");
      expect(xml).toContain("<PrcItem>50000</PrcItem>");
      expect(xml).toContain("<MontoItem>500000</MontoItem>");

      expect(xml).toContain("<NroLinDet>2</NroLinDet>");
      expect(xml).toContain("<NmbItem>Licencia de software mensual</NmbItem>");
      expect(xml).toContain("<DescuentoMonto>10000</DescuentoMonto>");
    });

    it("debe generar ID de Documento correcto", () => {
      const xml = builder.buildDteXml(baseDteData);
      expect(xml).toContain('ID="DTE-33-123"');
    });

    it("debe omitir IVA cuando es cero", () => {
      const exentaData = {
        ...baseDteData,
        documentType: "FACTURA_EXENTA" as any,
        ivaRate: 0,
        ivaAmount: 0,
        totalAmount: 590000,
      };
      const xml = builder.buildDteXml(exentaData);

      expect(xml).not.toContain("<TasaIVA>");
      expect(xml).not.toContain("<IVA>");
      expect(xml).toContain("<MntTotal>590000</MntTotal>");
    });

    it("debe truncar campos que excedan el largo máximo", () => {
      const longData = {
        ...baseDteData,
        emisor: {
          ...baseDteData.emisor,
          razonSocial: "A".repeat(200), // max 100
        },
      };
      const xml = builder.buildDteXml(longData);

      // Debería estar truncado a 100
      const match = xml.match(/<RznSoc>([^<]+)<\/RznSoc>/);
      expect(match?.[1]).toHaveLength(100);
    });

    it("debe formatear RUT sin puntos y con guión", () => {
      const xml = builder.buildDteXml(baseDteData);

      // RUT emisor sin puntos
      expect(xml).not.toContain("76.543.210");
      expect(xml).toContain("76543210-K");
    });
  });
});
