import PDFDocument from "pdfkit";
import { formatCLP } from "../../shared/chile.utils.js";
import { SII_DOCUMENT_TYPES } from "../../config/constants.js";
import type { DocumentType } from "@prisma/client";

interface InvoicePdfData {
  // Tenant (emisor)
  tenant: {
    businessName: string;
    rut: string;
    address?: string | null;
    commune?: string | null;
    region?: string | null;
    economicActivity?: string | null;
  };
  // Cliente (receptor)
  client: {
    businessName: string;
    rut: string;
    address?: string | null;
    commune?: string | null;
    region?: string | null;
  };
  // Factura
  invoice: {
    documentType: DocumentType;
    folio: number | null;
    issueDate: Date;
    dueDate: Date;
    netAmount: number;
    ivaRate: number;
    ivaAmount: number;
    totalAmount: number;
    notes?: string | null;
    items: Array<{
      lineNumber: number;
      code?: string | null;
      description: string;
      quantity: number;
      unit?: string | null;
      unitPrice: number;
      discount: number;
      lineTotal: number;
      isExempt: boolean;
    }>;
  };
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  FACTURA_ELECTRONICA: "FACTURA ELECTRÓNICA",
  BOLETA_ELECTRONICA: "BOLETA ELECTRÓNICA",
  NOTA_CREDITO_ELECTRONICA: "NOTA DE CRÉDITO ELECTRÓNICA",
  NOTA_DEBITO_ELECTRONICA: "NOTA DE DÉBITO ELECTRÓNICA",
  FACTURA_EXENTA: "FACTURA ELECTRÓNICA EXENTA",
  LIQUIDACION_FACTURA: "LIQUIDACIÓN FACTURA",
};

/**
 * Genera un PDF de factura en formato Buffer.
 * Estilo simple para MVP — sin integración SII.
 */
export function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Uint8Array[] = [];

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { tenant, client, invoice } = data;
    const docLabel =
      DOCUMENT_TYPE_LABELS[invoice.documentType] ?? "DOCUMENTO TRIBUTARIO";
    const siiCode =
      SII_DOCUMENT_TYPES[invoice.documentType as keyof typeof SII_DOCUMENT_TYPES] ?? "";

    // ─── Encabezado: Emisor ──────────────────────────────
    doc.fontSize(14).font("Helvetica-Bold").text(tenant.businessName, 50, 50);
    doc.fontSize(9).font("Helvetica");
    doc.text(`RUT: ${tenant.rut}`);
    if (tenant.economicActivity) doc.text(`Giro: ${tenant.economicActivity}`);
    if (tenant.address) {
      const addr = [tenant.address, tenant.commune, tenant.region]
        .filter(Boolean)
        .join(", ");
      doc.text(addr);
    }

    // ─── Recuadro DTE ────────────────────────────────────
    const boxX = 380;
    const boxY = 50;
    doc.rect(boxX, boxY, 180, 70).stroke("#CC0000");
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#CC0000");
    doc.text(`R.U.T.: ${tenant.rut}`, boxX + 10, boxY + 8, {
      width: 160,
      align: "center",
    });
    doc.text(docLabel, boxX + 10, boxY + 22, {
      width: 160,
      align: "center",
    });
    if (invoice.folio) {
      doc.text(`N° ${invoice.folio}`, boxX + 10, boxY + 36, {
        width: 160,
        align: "center",
      });
    }
    if (siiCode) {
      doc.fontSize(7).text(`S.I.I. - ${siiCode}`, boxX + 10, boxY + 52, {
        width: 160,
        align: "center",
      });
    }
    doc.fillColor("black");

    // ─── Datos del receptor ──────────────────────────────
    let y = 145;
    doc.moveTo(50, y).lineTo(560, y).stroke();
    y += 8;
    doc.fontSize(9).font("Helvetica-Bold").text("RECEPTOR", 50, y);
    y += 14;
    doc.font("Helvetica");
    doc.text(`Razón Social: ${client.businessName}`, 50, y);
    y += 14;
    doc.text(`RUT: ${client.rut}`, 50, y);
    y += 14;
    if (client.address) {
      const addr = [client.address, client.commune, client.region]
        .filter(Boolean)
        .join(", ");
      doc.text(`Dirección: ${addr}`, 50, y);
      y += 14;
    }

    // Fechas
    const fmtDate = (d: Date) =>
      new Date(d).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

    doc.text(`Fecha Emisión: ${fmtDate(invoice.issueDate)}`, 380, 159);
    doc.text(`Fecha Vencimiento: ${fmtDate(invoice.dueDate)}`, 380, 173);

    // ─── Tabla de ítems ──────────────────────────────────
    y += 15;
    doc.moveTo(50, y).lineTo(560, y).stroke();
    y += 5;

    // Header
    const cols = { code: 50, desc: 100, qty: 310, unit: 355, price: 400, disc: 460, total: 505 };
    doc.fontSize(8).font("Helvetica-Bold");
    doc.text("Código", cols.code, y, { width: 45 });
    doc.text("Descripción", cols.desc, y, { width: 200 });
    doc.text("Cant.", cols.qty, y, { width: 40, align: "right" });
    doc.text("Unid.", cols.unit, y, { width: 35 });
    doc.text("P. Unit.", cols.price, y, { width: 55, align: "right" });
    doc.text("Dcto.", cols.disc, y, { width: 40, align: "right" });
    doc.text("Total", cols.total, y, { width: 55, align: "right" });
    y += 14;
    doc.moveTo(50, y).lineTo(560, y).stroke();
    y += 5;

    // Rows
    doc.font("Helvetica").fontSize(8);
    for (const item of invoice.items) {
      if (y > 650) {
        doc.addPage();
        y = 50;
      }
      doc.text(item.code ?? "", cols.code, y, { width: 45 });
      doc.text(item.description, cols.desc, y, { width: 200 });
      doc.text(String(item.quantity), cols.qty, y, { width: 40, align: "right" });
      doc.text(item.unit ?? "UN", cols.unit, y, { width: 35 });
      doc.text(formatCLP(item.unitPrice, { showSymbol: false }), cols.price, y, {
        width: 55,
        align: "right",
      });
      doc.text(
        item.discount > 0 ? formatCLP(item.discount, { showSymbol: false }) : "",
        cols.disc,
        y,
        { width: 40, align: "right" },
      );
      doc.text(formatCLP(item.lineTotal, { showSymbol: false }), cols.total, y, {
        width: 55,
        align: "right",
      });
      y += 14;
    }

    // ─── Totales ─────────────────────────────────────────
    y += 10;
    doc.moveTo(380, y).lineTo(560, y).stroke();
    y += 8;
    doc.font("Helvetica");
    doc.text("Neto:", 380, y);
    doc.text(formatCLP(invoice.netAmount), 505, y, { width: 55, align: "right" });
    y += 14;

    if (invoice.ivaAmount > 0) {
      doc.text(`IVA (${Math.round(invoice.ivaRate * 100)}%):`, 380, y);
      doc.text(formatCLP(invoice.ivaAmount), 505, y, {
        width: 55,
        align: "right",
      });
      y += 14;
    }

    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("TOTAL:", 380, y);
    doc.text(formatCLP(invoice.totalAmount), 505, y, {
      width: 55,
      align: "right",
    });

    // Notas
    if (invoice.notes) {
      y += 30;
      doc.font("Helvetica").fontSize(8);
      doc.text("Observaciones:", 50, y);
      y += 12;
      doc.text(invoice.notes, 50, y, { width: 300 });
    }

    // Footer
    doc
      .fontSize(7)
      .font("Helvetica")
      .text(
        "Documento generado por PymeFlow — www.pymeflow.cl",
        50,
        doc.page.height - 50,
        { align: "center", width: 510 },
      );

    doc.end();
  });
}
