import { create } from "xmlbuilder2";
import { SII_DOCUMENT_TYPES } from "../../config/constants.js";
import type { DocumentType } from "@prisma/client";

/**
 * Datos necesarios para construir un DTE (Documento Tributario Electrónico).
 */
export interface DteData {
  // Identificación del documento
  documentType: DocumentType;
  folio: number;
  issueDate: Date;

  // Emisor (Tenant)
  emisor: {
    rut: string;         // RUT normalizado (sin puntos, con guión)
    razonSocial: string;
    giro: string;        // Actividad económica
    direccion: string;
    comuna: string;
    acteco?: string;     // Código actividad económica SII
  };

  // Receptor (Cliente)
  receptor: {
    rut: string;         // RUT normalizado
    razonSocial: string;
    giro?: string;
    direccion?: string;
    comuna?: string;
  };

  // Items
  items: Array<{
    lineNumber: number;
    description: string;
    quantity: number;
    unit?: string;
    unitPrice: number;
    discount: number;
    lineTotal: number;
    isExempt: boolean;
  }>;

  // Montos
  netAmount: number;
  ivaRate: number;
  ivaAmount: number;
  totalAmount: number;

  // Resolución SII del emisor
  siiResolution?: string;
  siiResolutionDate?: Date;

  // Referencia interna
  internalRef?: string;
}

/**
 * Datos del CAF para generar el Timbre Electrónico SII (TED).
 */
export interface TedData {
  cafXml: string;         // XML CAF completo
  cafPrivateKey: string;  // Clave privada RSA del CAF
}

/**
 * Construye el XML DTE tipo 33 (Factura Electrónica) y derivados
 * según la especificación técnica del SII de Chile.
 *
 * Estructura: <DTE> → <Documento> → <Encabezado> + <Detalle>* + <TED>
 */
export class DteBuilder {
  /**
   * Genera el XML DTE completo (sin firmar).
   */
  buildDteXml(data: DteData, tedData?: TedData): string {
    const siiDocType = SII_DOCUMENT_TYPES[data.documentType];
    const issueDateStr = this.formatDate(data.issueDate);

    const doc = create({ version: "1.0", encoding: "ISO-8859-1" })
      .ele("DTE", { version: "1.0" })
        .ele("Documento", { ID: `DTE-${siiDocType}-${data.folio}` });

    // ─── Encabezado ──────────────────────────────────
    const encabezado = doc.ele("Encabezado");

    // IdDoc
    const idDoc = encabezado.ele("IdDoc");
    idDoc.ele("TipoDTE").txt(String(siiDocType));
    idDoc.ele("Folio").txt(String(data.folio));
    idDoc.ele("FchEmis").txt(issueDateStr);
    if (data.internalRef) {
      idDoc.ele("TermPagoGlosa").txt(data.internalRef);
    }
    idDoc.up(); // close IdDoc

    // Emisor
    const emisor = encabezado.ele("Emisor");
    emisor.ele("RUTEmisor").txt(this.formatRutSii(data.emisor.rut));
    emisor.ele("RznSoc").txt(this.truncate(data.emisor.razonSocial, 100));
    emisor.ele("GiroEmis").txt(this.truncate(data.emisor.giro, 80));
    if (data.emisor.acteco) {
      emisor.ele("Acteco").txt(data.emisor.acteco);
    }
    emisor.ele("DirOrigen").txt(this.truncate(data.emisor.direccion, 70));
    emisor.ele("CmnaOrigen").txt(this.truncate(data.emisor.comuna, 20));
    emisor.up(); // close Emisor

    // Receptor
    const receptor = encabezado.ele("Receptor");
    receptor.ele("RUTRecep").txt(this.formatRutSii(data.receptor.rut));
    receptor.ele("RznSocRecep").txt(this.truncate(data.receptor.razonSocial, 100));
    if (data.receptor.giro) {
      receptor.ele("GiroRecep").txt(this.truncate(data.receptor.giro, 40));
    }
    if (data.receptor.direccion) {
      receptor.ele("DirRecep").txt(this.truncate(data.receptor.direccion, 70));
    }
    if (data.receptor.comuna) {
      receptor.ele("CmnaRecep").txt(this.truncate(data.receptor.comuna, 20));
    }
    receptor.up(); // close Receptor

    // Totales
    const totales = encabezado.ele("Totales");
    totales.ele("MntNeto").txt(String(Math.round(data.netAmount)));
    if (data.ivaAmount > 0) {
      totales.ele("TasaIVA").txt(String(Math.round(data.ivaRate * 100)));
      totales.ele("IVA").txt(String(Math.round(data.ivaAmount)));
    }
    totales.ele("MntTotal").txt(String(Math.round(data.totalAmount)));
    totales.up(); // close Totales

    encabezado.up(); // close Encabezado

    // ─── Detalle ─────────────────────────────────────
    for (const item of data.items) {
      const detalle = doc.ele("Detalle");
      detalle.ele("NroLinDet").txt(String(item.lineNumber));
      detalle.ele("NmbItem").txt(this.truncate(item.description, 80));
      if (item.unit) {
        detalle.ele("UnmdItem").txt(item.unit);
      }
      detalle.ele("QtyItem").txt(String(item.quantity));
      detalle.ele("PrcItem").txt(String(Math.round(item.unitPrice)));
      if (item.discount > 0) {
        detalle.ele("DescuentoPct").txt(
          String(Math.round((item.discount / (item.quantity * item.unitPrice)) * 100)),
        );
        detalle.ele("DescuentoMonto").txt(String(Math.round(item.discount)));
      }
      detalle.ele("MontoItem").txt(String(Math.round(item.lineTotal)));
      detalle.up(); // close Detalle
    }

    // ─── TED (Timbre Electrónico) ────────────────────
    if (tedData) {
      const tedXml = this.buildTed(data, siiDocType, tedData);
      // Insertar TED como raw XML
      doc.import(create(tedXml).root());
    }

    doc.up(); // close Documento
    doc.up(); // close DTE

    return doc.end({ prettyPrint: false });
  }

  /**
   * Construye el Timbre Electrónico SII (TED).
   * El TED contiene un resumen del documento firmado con la clave del CAF.
   */
  private buildTed(
    data: DteData,
    siiDocType: number,
    tedData: TedData,
  ): string {
    const issueDateStr = this.formatDate(data.issueDate);
    const firstItemDesc = data.items[0]?.description ?? "";

    // DD = datos a firmar
    const dd = create()
      .ele("DD")
        .ele("RE").txt(this.formatRutSii(data.emisor.rut)).up()
        .ele("TD").txt(String(siiDocType)).up()
        .ele("F").txt(String(data.folio)).up()
        .ele("FE").txt(issueDateStr).up()
        .ele("RR").txt(this.formatRutSii(data.receptor.rut)).up()
        .ele("RSR").txt(this.truncate(data.receptor.razonSocial, 40)).up()
        .ele("MNT").txt(String(Math.round(data.totalAmount))).up()
        .ele("IT1").txt(this.truncate(firstItemDesc, 40)).up()
        // CAF embebido (sin encriptar, es la parte pública)
        .ele("CAF", { version: "1.0" })
          .import(this.extractCafDa(tedData.cafXml))
        .up()
        .ele("TSTED").txt(this.formatTimestamp(new Date())).up()
      .up(); // close DD

    const ddXml = dd.end({ prettyPrint: false });

    // Firmar DD con clave privada del CAF (SHA1withRSA)
    const signature = this.signTed(ddXml, tedData.cafPrivateKey);

    // Construir TED completo
    const ted = create()
      .ele("TED", { version: "1.0" })
        .import(create(ddXml).root())
        .ele("FRMT", { algoritmo: "SHA1withRSA" })
          .txt(signature)
        .up()
      .up();

    return ted.end({ prettyPrint: false });
  }

  /**
   * Firma el DD del TED con la clave privada RSA del CAF.
   */
  private signTed(ddXml: string, privateKeyPem: string): string {
    const crypto = require("node:crypto") as typeof import("node:crypto");
    const sign = crypto.createSign("SHA1");
    sign.update(ddXml, "utf8");
    return sign.sign(privateKeyPem, "base64");
  }

  /**
   * Extrae el nodo <DA> del XML CAF para insertarlo en el TED.
   */
  private extractCafDa(cafXml: string): ReturnType<typeof create> {
    // Encontrar <DA>...</DA> en el CAF
    const daMatch = cafXml.match(/<DA>[\s\S]*?<\/DA>/);
    if (!daMatch) {
      throw new Error("No se encontró el nodo DA en el XML CAF");
    }
    return create(daMatch[0]).root();
  }

  /** Formatea fecha a YYYY-MM-DD */
  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0]!;
  }

  /** Formatea timestamp a formato SII: YYYY-MM-DDTHH:mm:ss */
  private formatTimestamp(date: Date): string {
    return date.toISOString().replace(/\.\d{3}Z$/, "");
  }

  /**
   * Formatea RUT para el SII (con guión, sin puntos).
   * Entrada: "76123456-7" o "761234567" → "76123456-7"
   */
  private formatRutSii(rut: string): string {
    const clean = rut.replace(/[.\s]/g, "");
    if (clean.includes("-")) return clean;
    return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
  }

  /** Trunca un string al largo máximo */
  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? text.slice(0, maxLength) : text;
  }
}
