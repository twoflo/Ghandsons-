import PDFDocument from "pdfkit";
import { formatMoney } from "../money";
import { formatDate } from "../dates";

/**
 * A small A4 document builder on top of pdfkit.
 *
 * Deliberately plain: black text, one accent rule, generous leading. These
 * PDFs get printed on a site office inkjet and photographed by clients, so
 * legibility beats decoration. No external fonts — the built-in Helvetica
 * keeps the file under 20KB and renders identically everywhere.
 */

export const PAGE = { width: 595.28, height: 841.89, margin: 48 };
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

const INK = "#0f172a";
const MUTED = "#64748b";
const RULE = "#cbd5e1";
const ACCENT = "#ea580c";

export type BusinessHeader = {
  tradingName: string;
  legalName?: string | null;
  abn?: string | null;
  licenceNumber?: string | null;
  addressLine1?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
};

export type DocumentColumn = {
  label: string;
  width: number;
  align?: "left" | "right";
};

export type DocumentRow = {
  cells: string[];
  isHeading?: boolean;
  muted?: string;
};

export function createDoc(title: string) {
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE.margin,
    info: { Title: title, Creator: "Ghandsons" },
    autoFirstPage: true,
  });
  return doc;
}

export function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export function drawHeader(
  doc: PDFKit.PDFDocument,
  business: BusinessHeader,
  docType: string,
  docNumber: string,
) {
  const top = PAGE.margin;

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(18).text(business.tradingName, PAGE.margin, top);

  const contact = [
    [business.addressLine1, business.suburb, business.state, business.postcode].filter(Boolean).join(" "),
    [business.phone, business.email].filter(Boolean).join("  ·  "),
    business.website ?? "",
    business.abn ? `ABN ${business.abn}` : "",
    business.licenceNumber ? `Licence ${business.licenceNumber}` : "",
  ].filter(Boolean);

  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  let y = top + 24;
  for (const line of contact) {
    doc.text(line, PAGE.margin, y, { width: CONTENT_WIDTH * 0.55 });
    y += 11;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(ACCENT)
    .text(docType.toUpperCase(), PAGE.margin + CONTENT_WIDTH * 0.55, top, {
      width: CONTENT_WIDTH * 0.45,
      align: "right",
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(INK)
    .text(docNumber, PAGE.margin + CONTENT_WIDTH * 0.55, top + 26, {
      width: CONTENT_WIDTH * 0.45,
      align: "right",
    });

  const ruleY = Math.max(y, top + 58) + 6;
  doc.moveTo(PAGE.margin, ruleY).lineTo(PAGE.width - PAGE.margin, ruleY).lineWidth(2).strokeColor(ACCENT).stroke();
  doc.y = ruleY + 14;
}

/** Two columns of label/value, e.g. "Prepared for" and "Dates". */
export function drawPanels(
  doc: PDFKit.PDFDocument,
  left: { title: string; lines: string[] },
  right: { title: string; rows: Array<[string, string]> },
) {
  const startY = doc.y;
  const colWidth = CONTENT_WIDTH * 0.52;

  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text(left.title.toUpperCase(), PAGE.margin, startY);
  doc.font("Helvetica").fontSize(10).fillColor(INK);
  let ly = startY + 13;
  for (const line of left.lines.filter(Boolean)) {
    doc.text(line, PAGE.margin, ly, { width: colWidth });
    ly += 13;
  }

  const rx = PAGE.margin + CONTENT_WIDTH * 0.58;
  const rw = CONTENT_WIDTH * 0.42;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text(right.title.toUpperCase(), rx, startY);
  let ry = startY + 13;
  for (const [label, value] of right.rows) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(label, rx, ry, { width: rw * 0.5 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK)
      .text(value, rx + rw * 0.5, ry, { width: rw * 0.5, align: "right" });
    ry += 14;
  }

  doc.y = Math.max(ly, ry) + 10;
}

export function drawParagraph(doc: PDFKit.PDFDocument, title: string, body: string | null | undefined) {
  if (!body?.trim()) return;
  ensureSpace(doc, 70);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text(title.toUpperCase(), PAGE.margin, doc.y);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(body.trim(), PAGE.margin, doc.y, {
    width: CONTENT_WIDTH,
    lineGap: 2.5,
  });
  doc.moveDown(0.8);
}

export function drawTable(
  doc: PDFKit.PDFDocument,
  columns: DocumentColumn[],
  rows: DocumentRow[],
) {
  const headerHeight = 18;
  ensureSpace(doc, headerHeight + 40);

  const drawColumnHeader = () => {
    const y = doc.y;
    doc.rect(PAGE.margin, y, CONTENT_WIDTH, headerHeight).fillColor("#f1f5f9").fill();
    let x = PAGE.margin + 6;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
    for (const col of columns) {
      doc.text(col.label.toUpperCase(), x, y + 5.5, { width: col.width - 12, align: col.align ?? "left" });
      x += col.width;
    }
    doc.y = y + headerHeight + 4;
  };

  drawColumnHeader();

  for (const row of rows) {
    const heights = columns.map((col, i) =>
      doc.font(row.isHeading ? "Helvetica-Bold" : "Helvetica").fontSize(9)
        .heightOfString(row.cells[i] ?? "", { width: col.width - 12 }),
    );
    let rowHeight = Math.max(...heights, 12) + 7;
    if (row.muted) rowHeight += 11;

    if (doc.y + rowHeight > PAGE.height - PAGE.margin - 60) {
      doc.addPage();
      drawColumnHeader();
    }

    const y = doc.y;
    if (row.isHeading) {
      doc.rect(PAGE.margin, y - 2, CONTENT_WIDTH, rowHeight).fillColor("#f8fafc").fill();
    }

    let x = PAGE.margin + 6;
    for (const [i, col] of columns.entries()) {
      doc
        .font(row.isHeading ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .fillColor(INK)
        .text(row.cells[i] ?? "", x, y + 2, { width: col.width - 12, align: col.align ?? "left" });
      x += col.width;
    }

    if (row.muted) {
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
        .text(row.muted, PAGE.margin + 6, y + Math.max(...heights, 12) + 3, { width: CONTENT_WIDTH - 12 });
    }

    doc.y = y + rowHeight;
    doc.moveTo(PAGE.margin, doc.y - 3).lineTo(PAGE.width - PAGE.margin, doc.y - 3)
      .lineWidth(0.5).strokeColor(RULE).stroke();
  }

  doc.y += 6;
}

export function drawTotals(
  doc: PDFKit.PDFDocument,
  rows: Array<{ label: string; cents: number; strong?: boolean; note?: string }>,
) {
  ensureSpace(doc, rows.length * 16 + 20);
  const boxWidth = 230;
  const x = PAGE.width - PAGE.margin - boxWidth;

  for (const row of rows) {
    const y = doc.y;
    if (row.strong) {
      doc.rect(x, y - 3, boxWidth, 22).fillColor("#f1f5f9").fill();
      doc.moveTo(x, y - 3).lineTo(x + boxWidth, y - 3).lineWidth(1.2).strokeColor(INK).stroke();
    }
    doc
      .font(row.strong ? "Helvetica-Bold" : "Helvetica")
      .fontSize(row.strong ? 11.5 : 9.5)
      .fillColor(row.strong ? INK : MUTED)
      .text(row.label, x + 8, y + 2, { width: boxWidth * 0.5 });
    doc
      .font("Helvetica-Bold")
      .fontSize(row.strong ? 11.5 : 9.5)
      .fillColor(INK)
      .text(formatMoney(row.cents), x + boxWidth * 0.5, y + 2, { width: boxWidth * 0.5 - 8, align: "right" });
    doc.y = y + (row.strong ? 24 : 15);
    if (row.note) {
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED)
        .text(row.note, x + 8, doc.y, { width: boxWidth - 16, align: "right" });
      doc.y += 11;
    }
  }
  doc.y += 8;
}

export function drawFooter(doc: PDFKit.PDFDocument, lines: string[]) {
  const range = doc.bufferedPageRange();
  void range;
  ensureSpace(doc, 40);
  doc.moveTo(PAGE.margin, doc.y).lineTo(PAGE.width - PAGE.margin, doc.y)
    .lineWidth(0.5).strokeColor(RULE).stroke();
  doc.y += 8;
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  for (const line of lines.filter(Boolean)) {
    doc.text(line, PAGE.margin, doc.y, { width: CONTENT_WIDTH, lineGap: 1.5 });
    doc.y += doc.heightOfString(line, { width: CONTENT_WIDTH }) + 2;
  }
}

export function drawBankDetails(
  doc: PDFKit.PDFDocument,
  bank: { accountName?: string | null; bsb?: string | null; accountNumber?: string | null },
  reference: string,
) {
  if (!bank.bsb && !bank.accountNumber) return;
  ensureSpace(doc, 74);
  const y = doc.y;
  doc.rect(PAGE.margin, y, CONTENT_WIDTH * 0.52, 66).fillColor("#f8fafc").fill();
  doc.rect(PAGE.margin, y, 3, 66).fillColor(ACCENT).fill();

  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text("HOW TO PAY", PAGE.margin + 12, y + 9);
  doc.font("Helvetica").fontSize(9).fillColor(INK);
  const lines = [
    bank.accountName ? `Account: ${bank.accountName}` : "",
    bank.bsb ? `BSB: ${bank.bsb}` : "",
    bank.accountNumber ? `Account no: ${bank.accountNumber}` : "",
    `Reference: ${reference}`,
  ].filter(Boolean);
  let ly = y + 22;
  for (const line of lines) {
    doc.text(line, PAGE.margin + 12, ly);
    ly += 11;
  }
  doc.y = y + 74;
}

export function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > PAGE.height - PAGE.margin) doc.addPage();
}

export function formatDateSafe(value: string | Date | null | undefined): string {
  return value ? formatDate(value) : "—";
}
