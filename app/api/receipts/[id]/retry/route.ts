import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { processReceiptUpload } from "@/lib/receipts/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

/** "Read it again" — runs the pipeline over the same image a second time. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(user.role, "receipts.review")) {
    return NextResponse.json({ error: "You can't review receipts." }, { status: 403 });
  }

  const { id } = await params;
  await processReceiptUpload(id);
  return NextResponse.json({ ok: true });
}
