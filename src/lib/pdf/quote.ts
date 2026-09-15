import {
  createDoc, collect, drawHeader, drawPanels, drawParagraph, drawTable, drawTotals,
  drawFooter, formatDateSafe, CONTENT_WIDTH, type BusinessHeader, type DocumentRow,
} from "./builder";
import { formatMoney } from "../money";
import type { QuoteDetail, QuoteLineRow } from "@/modules/quotes/queries";

export async function renderQuotePdf(
  quote: QuoteDetail,
  lines: QuoteLineRow[],
  business: BusinessHeader,
): Promise<Buffer> {
  const doc = createDoc(`${quote.quoteNumber} — ${quote.title}`);
  const done = collect(doc);

  drawHeader(doc, business, "Quote", quote.quoteNumber);

  drawPanels(
    doc,
    {
      title: "Prepared for",
      lines: [
        quote.clientName,
        quote.clientAbn ? `ABN ${quote.clientAbn}` : "",
        quote.clientAddress ?? "",
        quote.clientEmail ?? "",
        quote.siteAddress && quote.siteAddress !== quote.clientAddress
          ? `Site: ${quote.siteAddress}`
          : "",
      ],
    },
    {
      title: "Details",
      rows: [
        ["Date", formatDateSafe(quote.issueDate)],
        ["Price holds until", formatDateSafe(quote.validUntil)],
        ...(quote.revision > 1 ? ([["Revision", String(quote.revision)]] as Array<[string, string]>) : []),
        ["Total inc GST", formatMoney(quote.totalCents)],
      ],
    },
  );

  doc.font("Helvetica-Bold").fontSize(13).fillColor("#0f172a").text(quote.title, { width: CONTENT_WIDTH });
  doc.moveDown(0.6);

  drawParagraph(doc, "Scope of work", quote.scopeOfWork);

  const columns = [
    { label: "Item", width: CONTENT_WIDTH * 0.52 },
    { label: "Qty", width: CONTENT_WIDTH * 0.12, align: "right" as const },
    { label: "Unit price", width: CONTENT_WIDTH * 0.18, align: "right" as const },
    { label: "Amount", width: CONTENT_WIDTH * 0.18, align: "right" as const },
  ];

  const rows: DocumentRow[] = lines.map((line) =>
    line.isHeading
      ? { cells: [line.description, "", "", ""], isHeading: true }
      : {
          cells: [
            line.description,
            `${trimNumber(line.quantity)} ${line.unit}`,
            formatMoney(line.unitPriceCents),
            formatMoney(line.lineSubtotalCents),
          ],
          muted: line.notes ?? undefined,
        },
  );

  drawTable(doc, columns, rows);

  const gstFreeLines = lines.filter((l) => !l.isHeading && l.taxRateBp === 0);

  drawTotals(doc, [
    { label: "Subtotal (ex GST)", cents: quote.subtotalCents },
    {
      label: "GST",
      cents: quote.taxCents,
      note: gstFreeLines.length ? `${gstFreeLines.length} line(s) are GST free` : undefined,
    },
    { label: "Total inc GST", cents: quote.totalCents, strong: true },
  ]);

  drawParagraph(doc, "Not included", quote.exclusions);
  drawParagraph(doc, "Terms", quote.terms);

  drawFooter(doc, [
    quote.status === "accepted" && quote.acceptedByName
      ? `Accepted by ${quote.acceptedByName} on ${formatDateSafe(quote.acceptedAt)}.`
      : "To accept this quote, reply to the email it came with or give us a call. We'll confirm a start date before ordering anything.",
    business.licenceNumber ? `${business.tradingName} — licence ${business.licenceNumber}.` : "",
    "All prices in Australian dollars and include GST where shown.",
  ]);

  doc.end();
  return done;
}

/** "2.500" -> "2.5", "1.000" -> "1" */
function trimNumber(value: string): string {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return String(Number(n.toFixed(3)));
}
