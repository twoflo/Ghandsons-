import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getInvoice, getInvoiceLines, getPayments } from "@/modules/invoices/queries";
import { getSettings } from "@/lib/settings";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  if (!can(user.role, "invoices.view")) return new NextResponse("No access", { status: 403 });

  const { id } = await params;
  const [invoice, lines, payments, settings] = await Promise.all([
    getInvoice(id), getInvoiceLines(id), getPayments(id), getSettings(),
  ]);
  if (!invoice) return new NextResponse("Invoice not found", { status: 404 });

  const pdf = await renderInvoicePdf(invoice, lines, payments, settings);

  await audit({
    entityType: "invoice",
    entityId: id,
    action: "send",
    summary: `Downloaded the PDF for invoice ${invoice.invoiceNumber}`,
    actorUserId: user.id,
    actorLabel: user.fullName,
  });

  const download = new URL(request.url).searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${invoice.invoiceNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
