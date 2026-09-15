import {
  createDoc, collect, drawHeader, drawPanels, drawTable, drawTotals, drawFooter,
  drawBankDetails, drawParagraph, formatDateSafe, CONTENT_WIDTH,
  type BusinessHeader, type DocumentRow,
} from "./builder";
import { formatMoney } from "../money";
import type { InvoiceDetail, InvoiceLineRow, PaymentRow } from "@/modules/invoices/queries";

const TYPE_LABEL: Record<string, string> = {
  standard: "Tax Invoice",
  deposit: "Deposit Invoice",
  progress: "Progress Claim",
  final: "Final Invoice",
};

export async function renderInvoicePdf(
  invoice: InvoiceDetail,
  lines: InvoiceLineRow[],
  paymentRows: PaymentRow[],
  business: BusinessHeader & {
    bankAccountName?: string | null;
    bankBsb?: string | null;
    bankAccountNumber?: string | null;
    invoiceFooter?: string | null;
  },
): Promise<Buffer> {
  const doc = createDoc(`${invoice.invoiceNumber} — ${invoice.clientName}`);
  const done = collect(doc);

  // "TAX INVOICE" is the wording the ATO requires on anything with GST on it.
  drawHeader(doc, business, TYPE_LABEL[invoice.type] ?? "Tax Invoice", invoice.invoiceNumber);

  drawPanels(
    doc,
    {
      title: "Bill to",
      lines: [
        invoice.clientName,
        invoice.clientAbn ? `ABN ${invoice.clientAbn}` : "",
        invoice.clientAddress ?? "",
        invoice.clientEmail ?? "",
        invoice.siteAddress ? `Site: ${invoice.siteAddress}` : "",
      ],
    },
    {
      title: "Details",
      rows: [
        ["Issued", formatDateSafe(invoice.issueDate)],
        ["Due", formatDateSafe(invoice.dueDate)],
        ["Terms", `${invoice.paymentTermsDays} days`],
        ...(invoice.jobNumber ? ([["Job", invoice.jobNumber]] as Array<[string, string]>) : []),
        ...(invoice.reference ? ([["Reference", invoice.reference]] as Array<[string, string]>) : []),
      ],
    },
  );

  if (invoice.jobTitle) {
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a")
      .text(invoice.jobTitle, { width: CONTENT_WIDTH });
    doc.moveDown(0.6);
  }

  const columns = [
    { label: "Description", width: CONTENT_WIDTH * 0.54 },
    { label: "Qty", width: CONTENT_WIDTH * 0.1, align: "right" as const },
    { label: "Unit price", width: CONTENT_WIDTH * 0.18, align: "right" as const },
    { label: "Amount", width: CONTENT_WIDTH * 0.18, align: "right" as const },
  ];

  const rows: DocumentRow[] = lines.map((line) =>
    line.isHeading
      ? { cells: [line.description, "", "", ""], isHeading: true }
      : {
          cells: [
            line.description,
            Number(line.quantity) === 1 ? "" : `${Number(line.quantity)} ${line.unit}`,
            formatMoney(line.unitPriceCents),
            formatMoney(line.lineSubtotalCents),
          ],
        },
  );

  drawTable(doc, columns, rows);

  const totalsRows: Parameters<typeof drawTotals>[1] = [
    { label: "Subtotal (ex GST)", cents: invoice.subtotalCents },
    { label: "GST", cents: invoice.taxCents },
    { label: "Total inc GST", cents: invoice.totalCents, strong: true },
  ];

  if (invoice.amountPaidCents > 0) {
    totalsRows.push({ label: "Already received", cents: -invoice.amountPaidCents });
    totalsRows.push({ label: "Amount due", cents: invoice.balanceCents, strong: true });
  }

  drawTotals(doc, totalsRows);

  if (invoice.type === "progress" && invoice.progressPercentBp) {
    drawParagraph(
      doc,
      "About this claim",
      `This claim covers work to ${invoice.progressPercentBp / 100}% of the contract. ` +
        `Previously claimed: ${formatMoney(invoice.previouslyClaimedCents)}.`,
    );
  }

  if (paymentRows.length > 0) {
    drawParagraph(
      doc,
      "Payments received",
      paymentRows
        .map((p) => `${formatDateSafe(p.paidOn)} — ${formatMoney(p.amountCents)}${p.reference ? ` (${p.reference})` : ""}`)
        .join("\n"),
    );
  }

  drawParagraph(doc, "Notes", invoice.notes);

  drawBankDetails(
    doc,
    {
      accountName: business.bankAccountName,
      bsb: business.bankBsb,
      accountNumber: business.bankAccountNumber,
    },
    invoice.invoiceNumber,
  );

  drawFooter(doc, [
    invoice.terms ?? business.invoiceFooter ?? "",
    business.abn ? `${business.tradingName} — ABN ${business.abn}.` : "",
    "Total includes GST at 10% where shown. Please quote the invoice number when paying.",
  ]);

  doc.end();
  return done;
}
