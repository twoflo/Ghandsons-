import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getQuote, getQuoteLines } from "@/modules/quotes/queries";
import { getSettings } from "@/lib/settings";
import { renderQuotePdf } from "@/lib/pdf/quote";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  if (!can(user.role, "quotes.view")) return new NextResponse("No access", { status: 403 });

  const { id } = await params;
  const [quote, lines, settings] = await Promise.all([
    getQuote(id), getQuoteLines(id), getSettings(),
  ]);
  if (!quote) return new NextResponse("Quote not found", { status: 404 });

  const pdf = await renderQuotePdf(quote, lines, settings);

  await audit({
    entityType: "quote",
    entityId: id,
    action: "send",
    summary: `Downloaded the PDF for quote ${quote.quoteNumber}`,
    actorUserId: user.id,
    actorLabel: user.fullName,
  });

  const download = new URL(request.url).searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${quote.quoteNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
