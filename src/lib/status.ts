import type { BadgeTone } from "@/components/ui";

/* The pipeline, in the order the owner thinks about it. */
export const JOB_STATUS_FLOW = [
  "lead",
  "quoted",
  "won",
  "scheduled",
  "in_progress",
  "complete",
  "invoiced",
  "paid",
] as const;

export type JobStatus =
  | (typeof JOB_STATUS_FLOW)[number]
  | "lost"
  | "cancelled";

export const JOB_STATUS: Record<JobStatus, { label: string; tone: BadgeTone; hint: string }> = {
  lead: { label: "Lead", tone: "neutral", hint: "Someone's asked for a price." },
  quoted: { label: "Quoted", tone: "info", hint: "Quote is out, waiting to hear back." },
  won: { label: "Won", tone: "good", hint: "They've said yes. Not booked in yet." },
  scheduled: { label: "Scheduled", tone: "brand", hint: "In the calendar with a crew." },
  in_progress: { label: "On site", tone: "brand", hint: "Work has started." },
  complete: { label: "Complete", tone: "good", hint: "Work finished, not invoiced yet." },
  invoiced: { label: "Invoiced", tone: "warn", hint: "Invoice sent, waiting on money." },
  paid: { label: "Paid", tone: "good", hint: "Money's in. Job closed." },
  lost: { label: "Lost", tone: "bad", hint: "Didn't get it." },
  cancelled: { label: "Cancelled", tone: "neutral", hint: "Called off." },
};

/** Which statuses can follow this one. Keeps the pipeline honest. */
export function nextJobStatuses(current: JobStatus): JobStatus[] {
  const i = (JOB_STATUS_FLOW as readonly string[]).indexOf(current);
  if (i === -1) return [...JOB_STATUS_FLOW];
  const forward = JOB_STATUS_FLOW.slice(Math.max(0, i - 1)) as JobStatus[];
  return [...new Set([...forward, "lost", "cancelled"] as JobStatus[])].filter((s) => s !== current);
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "superseded";

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  accepted: { label: "Accepted", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  expired: { label: "Expired", tone: "warn" },
  superseded: { label: "Superseded", tone: "neutral" },
};

export type InvoiceStatus = "draft" | "sent" | "part_paid" | "paid" | "overdue" | "void";

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  part_paid: { label: "Part paid", tone: "warn" },
  paid: { label: "Paid", tone: "good" },
  overdue: { label: "Overdue", tone: "bad" },
  void: { label: "Void", tone: "neutral" },
};

export type PoStatus = "draft" | "sent" | "part_received" | "received" | "invoiced" | "cancelled";

export const PO_STATUS: Record<PoStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Ordered", tone: "info" },
  part_received: { label: "Part delivered", tone: "warn" },
  received: { label: "Delivered", tone: "good" },
  invoiced: { label: "Invoiced", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export type VariationStatus = "draft" | "submitted" | "approved" | "rejected" | "invoiced";

export const VARIATION_STATUS: Record<VariationStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Awaiting approval", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  invoiced: { label: "Invoiced", tone: "good" },
};

export type TimeStatus = "open" | "draft" | "submitted" | "approved" | "rejected";

export const TIME_STATUS: Record<TimeStatus, { label: string; tone: BadgeTone }> = {
  open: { label: "Clocked on", tone: "brand" },
  draft: { label: "Not submitted", tone: "neutral" },
  submitted: { label: "Awaiting approval", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  rejected: { label: "Sent back", tone: "bad" },
};

export type ReceiptStatus =
  | "uploaded" | "processing" | "needs_review" | "approved" | "failed" | "discarded";

export const RECEIPT_STATUS: Record<ReceiptStatus, { label: string; tone: BadgeTone }> = {
  uploaded: { label: "Queued", tone: "neutral" },
  processing: { label: "Reading it", tone: "info" },
  needs_review: { label: "Check it", tone: "warn" },
  approved: { label: "Saved", tone: "good" },
  failed: { label: "Couldn't read", tone: "bad" },
  discarded: { label: "Binned", tone: "neutral" },
};

export const LINE_KIND: Record<string, { label: string; tone: BadgeTone }> = {
  labour: { label: "Labour", tone: "info" },
  material: { label: "Materials", tone: "brand" },
  subcontractor: { label: "Subbie", tone: "warn" },
  plant: { label: "Plant & hire", tone: "neutral" },
  other: { label: "Other", tone: "neutral" },
};
