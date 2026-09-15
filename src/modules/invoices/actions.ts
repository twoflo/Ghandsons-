"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import {
  invoices, invoiceLines, payments, expenses, variations, taxRates, jobs, jobStatusHistory,
} from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { formatMoney, taxOn, applyMarkup, lineTotal, roundHalf } from "@/lib/money";
import { addDaysIso, today } from "@/lib/dates";
import { fail, ok } from "@/lib/result";
import { getSettings } from "@/lib/settings";
import { moneyField, dateField } from "@/modules/jobs/validation";

/* ------------------------------ recalculation ----------------------------- */

/**
 * Re-derives an invoice's totals from its lines and its payments.
 *
 * The invoices_balance_consistent check constraint means the database will
 * reject any attempt to store a balance that doesn't equal total minus paid,
 * so this is the only place those three numbers are ever written.
 */
export async function recalcInvoice(tx: DbOrTx, invoiceId: string) {
  const lines = await tx
    .select()
    .from(invoiceLines)
    .where(and(eq(invoiceLines.invoiceId, invoiceId), isNull(invoiceLines.deletedAt)));

  const subtotalCents = lines.reduce((a, l) => a + l.lineSubtotalCents, 0);
  const taxCents = lines.reduce((a, l) => a + l.lineTaxCents, 0);
  const totalCents = subtotalCents + taxCents;

  const paid = await tx
    .select({ amountCents: payments.amountCents })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoiceId), isNull(payments.deletedAt)));

  const amountPaidCents = paid.reduce((a, p) => a + p.amountCents, 0);
  const balanceCents = totalCents - amountPaidCents;

  const [current] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!current) return null;

  // Status follows the money, except for draft and void which are decisions.
  let status = current.status;
  if (status !== "draft" && status !== "void") {
    if (balanceCents <= 0 && totalCents > 0) status = "paid";
    else if (amountPaidCents > 0) status = "part_paid";
    else if (current.dueDate && current.dueDate < today()) status = "overdue";
    else status = "sent";
  }

  await tx
    .update(invoices)
    .set({
      subtotalCents,
      taxCents,
      totalCents,
      amountPaidCents,
      balanceCents,
      status,
      paidAt: status === "paid" ? (current.paidAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));

  return { subtotalCents, taxCents, totalCents, amountPaidCents, balanceCents, status };
}

async function defaultTaxRate() {
  const [rate] = await db.select().from(taxRates).where(eq(taxRates.isDefault, true)).limit(1);
  return rate ?? null;
}

/* ------------------------------ create / edit ----------------------------- */

const LineSchema = z.object({
  id: z.string().uuid().optional(),
  isHeading: z.coerce.boolean().default(false),
  sourceType: z.string().default("manual"),
  sourceId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1, "Every line needs a description."),
  quantity: z
    .union([z.string(), z.number()])
    .default("1")
    .transform((v) => {
      const n = typeof v === "number" ? v : Number.parseFloat(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : Number.NaN;
    })
    .refine((n) => Number.isFinite(n), "Quantity has to be a number.")
    .refine((n) => n >= 0, "Quantity can't be negative."),
  unit: z.string().trim().max(20).default("ea"),
  unitPriceCents: moneyField,
  taxRateId: z.string().uuid().nullable().optional(),
});

const InvoiceSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid("Pick a client."),
  jobId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
  type: z.enum(["standard", "deposit", "progress", "final"]).default("standard"),
  issueDate: dateField,
  paymentTermsDays: z.coerce.number().int().min(0).max(120).default(14),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  terms: z.string().trim().max(4000).optional(),
  progressPercentBp: z.coerce.number().int().min(0).max(10_000).nullable().optional(),
  previouslyClaimedCents: moneyField.optional(),
  lines: z.array(LineSchema).min(1, "Add at least one line."),
});

export const saveInvoice = action("invoices.manage", InvoiceSchema, async (input, user) => {
  const rateRows = await db.select().from(taxRates);
  const rateMap = new Map(rateRows.map((r) => [r.id, r.rateBp]));
  const fallback = rateRows.find((r) => r.isDefault) ?? rateRows[0] ?? null;

  const issueDate = input.issueDate ?? today();
  const dueDate = addDaysIso(issueDate, input.paymentTermsDays);

  const invoiceId = await db.transaction(async (tx) => {
    let id = input.id;

    if (id) {
      const [before] = await tx.select().from(invoices).where(eq(invoices.id, id)).limit(1);
      if (!before) throw new Error("That invoice no longer exists.");
      if (before.status === "void") throw new Error("A voided invoice can't be edited.");
      if (before.amountPaidCents > 0) {
        throw new Error(
          "Money has already been received against this invoice, so the lines are locked. Void it and raise a new one if it's wrong.",
        );
      }

      await tx
        .update(invoices)
        .set({
          clientId: input.clientId,
          jobId: input.jobId,
          type: input.type,
          issueDate,
          dueDate,
          paymentTermsDays: input.paymentTermsDays,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
          progressPercentBp: input.progressPercentBp ?? null,
          previouslyClaimedCents: input.previouslyClaimedCents ?? 0,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id));
    } else {
      const invoiceNumber = await nextNumber(tx, "invoice");
      const [created] = await tx
        .insert(invoices)
        .values({
          invoiceNumber,
          clientId: input.clientId,
          jobId: input.jobId,
          type: input.type,
          status: "draft",
          issueDate,
          dueDate,
          paymentTermsDays: input.paymentTermsDays,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          terms: input.terms ?? null,
          progressPercentBp: input.progressPercentBp ?? null,
          previouslyClaimedCents: input.previouslyClaimedCents ?? 0,
          createdBy: user.id,
        })
        .returning({ id: invoices.id });
      id = created!.id;
    }

    /* Replace the lines. An expense that was billed on a line we're removing
     * has to be released, or it could never be invoiced again. */
    const keepIds = input.lines.map((l) => l.id).filter((v): v is string => Boolean(v));
    const existing = await tx
      .select({ id: invoiceLines.id })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, id));
    const toDelete = existing.filter((e) => !keepIds.includes(e.id)).map((e) => e.id);

    if (toDelete.length) {
      await tx
        .update(expenses)
        .set({ billedInvoiceLineId: null })
        .where(inArray(expenses.billedInvoiceLineId, toDelete));
      await tx.delete(invoiceLines).where(inArray(invoiceLines.id, toDelete));
    }

    for (const [index, line] of input.lines.entries()) {
      const taxRateId = line.taxRateId ?? fallback?.id ?? null;
      const rateBp = line.isHeading ? 0 : (rateMap.get(taxRateId ?? "") ?? 0);
      const lineSubtotalCents = line.isHeading ? 0 : lineTotal(line.quantity, line.unitPriceCents);
      const lineTaxCents = taxOn(lineSubtotalCents, rateBp);

      const payload = {
        invoiceId: id,
        sortOrder: index,
        isHeading: line.isHeading ? 1 : 0,
        sourceType: line.sourceType,
        sourceId: line.sourceId ?? null,
        description: line.description,
        quantity: String(line.quantity),
        unit: line.unit,
        unitPriceCents: line.unitPriceCents,
        lineSubtotalCents,
        taxRateId,
        lineTaxCents,
        lineTotalCents: lineSubtotalCents + lineTaxCents,
        updatedAt: new Date(),
      };

      let lineId = line.id;
      if (lineId) {
        await tx.update(invoiceLines).set(payload).where(eq(invoiceLines.id, lineId));
      } else {
        const [created] = await tx.insert(invoiceLines).values(payload).returning({ id: invoiceLines.id });
        lineId = created!.id;
      }

      // Lock the source so the same cost can't be billed twice.
      if (line.sourceType === "expense" && line.sourceId) {
        await tx
          .update(expenses)
          .set({ billedInvoiceLineId: lineId })
          .where(eq(expenses.id, line.sourceId));
      }
      if (line.sourceType === "variation" && line.sourceId) {
        await tx
          .update(variations)
          .set({ invoiceId: id, invoicedAt: new Date(), status: "invoiced" })
          .where(eq(variations.id, line.sourceId));
      }
    }

    const totals = await recalcInvoice(tx, id);

    await recordAudit(tx, {
      entityType: "invoice",
      entityId: id,
      action: input.id ? "update" : "create",
      summary: `${input.id ? "Updated" : "Raised"} invoice for ${formatMoney(totals?.totalCents ?? 0)}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: totals?.totalCents ?? 0,
    });

    return id;
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/dashboard");
  return ok({ id: invoiceId }, input.id ? "Invoice saved." : "Invoice created as a draft.");
});

/* ------------------------------- claim builder ----------------------------- */

const ClaimSchema = z.object({
  jobId: z.string().uuid(),
  type: z.enum(["deposit", "progress", "final", "standard"]),
  /** For a deposit or progress claim: the percentage of the revised contract. */
  percentBp: z.coerce.number().int().min(0).max(10_000).optional(),
  description: z.string().trim().max(300).optional(),
  includeExpenseIds: z.array(z.string().uuid()).default([]),
  expenseMarkupBp: z.coerce.number().int().min(0).max(100_000).default(0),
  includeVariationIds: z.array(z.string().uuid()).default([]),
  paymentTermsDays: z.coerce.number().int().min(0).max(120).default(14),
});

/**
 * Builds a claim off a job: a percentage of the contract, plus any billable
 * expenses and approved variations the owner ticks. Everything it pulls in is
 * marked as billed so it can't come around twice.
 */
export const createClaimFromJob = action("invoices.manage", ClaimSchema, async (input, user) => {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
  if (!job) return fail("That job no longer exists.");

  const [context] = (await db.execute(sql`
    SELECT revised_contract_cents::int AS revised, invoiced_ex_tax_cents::int AS claimed
    FROM job_financials WHERE job_id = ${input.jobId}
  `)) as unknown as Array<{ revised: number; claimed: number }>;

  const rate = await defaultTaxRate();
  const settings = await getSettings();
  const issueDate = today();

  const lines: Array<{
    sourceType: string; sourceId: string | null; description: string;
    quantity: string; unit: string; unitPriceCents: number;
  }> = [];

  if (input.percentBp && input.percentBp > 0) {
    const revised = context?.revised ?? job.contractValueCents;
    const cumulative = roundHalf((revised * input.percentBp) / 10_000);
    const thisClaim = cumulative - (context?.claimed ?? 0);

    if (thisClaim <= 0) {
      return fail(
        `You've already claimed ${formatMoney(context?.claimed ?? 0)} of ${formatMoney(revised)}. Pick a higher percentage.`,
        { percentBp: "Already claimed at or above this point." },
      );
    }

    lines.push({
      sourceType: input.type === "deposit" ? "deposit" : "progress",
      sourceId: null,
      description:
        input.description ||
        (input.type === "deposit"
          ? `Deposit — ${job.title} (${input.percentBp / 100}%)`
          : `Progress claim — ${job.title}, ${input.percentBp / 100}% of contract to date`),
      quantity: "1",
      unit: "ea",
      unitPriceCents: thisClaim,
    });
  }

  if (input.includeExpenseIds.length) {
    const rows = await db
      .select()
      .from(expenses)
      .where(and(inArray(expenses.id, input.includeExpenseIds), isNull(expenses.deletedAt)));

    for (const expense of rows) {
      if (expense.billedInvoiceLineId) continue;
      lines.push({
        sourceType: "expense",
        sourceId: expense.id,
        description: expense.description,
        quantity: "1",
        unit: "ea",
        unitPriceCents: applyMarkup(expense.subtotalCents, input.expenseMarkupBp),
      });
    }
  }

  if (input.includeVariationIds.length) {
    const rows = await db
      .select()
      .from(variations)
      .where(and(inArray(variations.id, input.includeVariationIds), isNull(variations.deletedAt)));

    for (const variation of rows) {
      if (variation.invoiceId) continue;
      lines.push({
        sourceType: "variation",
        sourceId: variation.id,
        description: `${variation.variationNumber} — ${variation.title}`,
        quantity: "1",
        unit: "ea",
        unitPriceCents: variation.subtotalCents,
      });
    }
  }

  if (lines.length === 0) {
    return fail("Nothing to invoice. Set a percentage, or tick some expenses or variations.");
  }

  const result = await saveInvoice({
    clientId: job.clientId,
    jobId: job.id,
    type: input.type,
    issueDate,
    paymentTermsDays: input.paymentTermsDays,
    progressPercentBp: input.percentBp ?? null,
    previouslyClaimedCents: String((context?.claimed ?? 0) / 100),
    terms: settings.invoiceFooter ?? "",
    lines: lines.map((line) => ({
      ...line,
      unitPriceCents: String(line.unitPriceCents / 100),
      taxRateId: rate?.id ?? null,
    })),
  });

  return result;
});

/* --------------------------------- status --------------------------------- */

const SendSchema = z.object({ invoiceId: z.string().uuid() });

export const markInvoiceSent = action("invoices.manage", SendSchema, async (input, user) => {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
  if (!invoice) return fail("That invoice no longer exists.");
  if (invoice.status !== "draft") return ok(undefined, "Already sent.");
  if (invoice.totalCents <= 0) return fail("An invoice for nothing can't be sent. Add some lines first.");

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(invoices.id, input.invoiceId));

    await recalcInvoice(tx, input.invoiceId);

    if (invoice.jobId) {
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, invoice.jobId)).limit(1);
      if (job && ["complete", "in_progress", "scheduled"].includes(job.status)) {
        await tx.update(jobs).set({ status: "invoiced", updatedAt: new Date() }).where(eq(jobs.id, job.id));
        await tx.insert(jobStatusHistory).values({
          jobId: job.id,
          fromStatus: job.status,
          toStatus: "invoiced",
          note: `Invoice ${invoice.invoiceNumber} sent`,
          changedBy: user.id,
        });
      }
    }

    await recordAudit(tx, {
      entityType: "invoice",
      entityId: input.invoiceId,
      action: "send",
      summary: `Sent invoice ${invoice.invoiceNumber} for ${formatMoney(invoice.totalCents)}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: invoice.totalCents,
    });
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${input.invoiceId}`);
  revalidatePath("/dashboard");
  return ok(undefined, "Marked as sent. The clock on the due date starts now.");
});

const VoidSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().trim().min(3, "Say why — it's a financial record."),
});

/**
 * Voiding, never deleting. The number stays used, the record stays readable,
 * and anything it billed is released so it can go on the replacement.
 */
export const voidInvoice = action("invoices.void", VoidSchema, async (input, user) => {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
  if (!invoice) return fail("That invoice no longer exists.");
  if (invoice.amountPaidCents > 0) {
    return fail(
      "There's money against this invoice. Refund or reallocate the payment first, then void it.",
    );
  }

  await db.transaction(async (tx) => {
    const lineIds = (
      await tx.select({ id: invoiceLines.id }).from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id))
    ).map((l) => l.id);

    if (lineIds.length) {
      await tx
        .update(expenses)
        .set({ billedInvoiceLineId: null })
        .where(inArray(expenses.billedInvoiceLineId, lineIds));
    }

    await tx
      .update(variations)
      .set({ invoiceId: null, invoicedAt: null, status: "approved" })
      .where(eq(variations.invoiceId, invoice.id));

    await tx
      .update(invoices)
      .set({
        status: "void",
        voidedAt: new Date(),
        voidReason: input.reason,
        balanceCents: 0,
        amountPaidCents: 0,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id));

    await recordAudit(tx, {
      entityType: "invoice",
      entityId: invoice.id,
      action: "delete",
      summary: `Voided invoice ${invoice.invoiceNumber} (${formatMoney(invoice.totalCents)}) — ${input.reason}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: invoice.totalCents,
    });
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${input.invoiceId}`);
  return ok(undefined, "Invoice voided. Anything it billed has been released.");
});

/* -------------------------------- payments -------------------------------- */

const PaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: moneyField.refine((v) => v > 0, "Enter an amount greater than zero."),
  paidOn: dateField,
  method: z.enum(["bank_transfer", "card", "cash", "cheque", "direct_debit", "other"]).default("bank_transfer"),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const recordPayment = action("payments.manage", PaymentSchema, async (input, user) => {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId)).limit(1);
  if (!invoice) return fail("That invoice no longer exists.");
  if (invoice.status === "draft") {
    return fail("Send the invoice before recording a payment against it.");
  }
  if (invoice.status === "void") return fail("You can't pay a voided invoice.");

  if (input.amountCents > invoice.balanceCents) {
    const over = input.amountCents - invoice.balanceCents;
    return fail(
      `That's ${formatMoney(over)} more than the ${formatMoney(invoice.balanceCents)} outstanding. Check the amount, or record the extra against another invoice.`,
      { amountCents: "More than the balance owing." },
    );
  }

  await db.transaction(async (tx) => {
    await tx.insert(payments).values({
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      paidOn: input.paidOn ?? today(),
      method: input.method,
      reference: input.reference ?? invoice.invoiceNumber,
      notes: input.notes ?? null,
      recordedBy: user.id,
    });

    const totals = await recalcInvoice(tx, input.invoiceId);

    // A fully paid invoice closes the job, if nothing else is outstanding.
    if (totals?.status === "paid" && invoice.jobId) {
      const [{ owing }] = (await tx.execute(sql`
        SELECT COALESCE(SUM(balance_cents), 0)::int AS owing FROM invoices
        WHERE job_id = ${invoice.jobId} AND deleted_at IS NULL AND status <> 'void'
      `)) as unknown as Array<{ owing: number }>;

      if (owing <= 0) {
        const [job] = await tx.select().from(jobs).where(eq(jobs.id, invoice.jobId)).limit(1);
        if (job && job.status === "invoiced") {
          await tx.update(jobs).set({ status: "paid", updatedAt: new Date() }).where(eq(jobs.id, job.id));
          await tx.insert(jobStatusHistory).values({
            jobId: job.id,
            fromStatus: job.status,
            toStatus: "paid",
            note: "All invoices settled",
            changedBy: user.id,
          });
        }
      }
    }

    await recordAudit(tx, {
      entityType: "invoice",
      entityId: input.invoiceId,
      action: "payment",
      summary: `Recorded ${formatMoney(input.amountCents)} against ${invoice.invoiceNumber} — ${formatMoney(
        totals?.balanceCents ?? 0,
      )} still owing`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: input.amountCents,
    });
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${input.invoiceId}`);
  revalidatePath("/dashboard");
  return ok(undefined, `${formatMoney(input.amountCents)} recorded.`);
});

const DeletePaymentSchema = z.object({ paymentId: z.string().uuid() });

export const reversePayment = action("payments.manage", DeletePaymentSchema, async (input, user) => {
  const [payment] = await db.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1);
  if (!payment) return fail("That payment no longer exists.");

  await db.transaction(async (tx) => {
    await tx.update(payments).set({ deletedAt: new Date() }).where(eq(payments.id, input.paymentId));
    await recalcInvoice(tx, payment.invoiceId);
    await recordAudit(tx, {
      entityType: "invoice",
      entityId: payment.invoiceId,
      action: "payment",
      summary: `Reversed a payment of ${formatMoney(payment.amountCents)} dated ${payment.paidOn}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: -payment.amountCents,
    });
  });

  revalidatePath(`/invoices/${payment.invoiceId}`);
  return ok(undefined, "Payment reversed. The record of it stays in the audit trail.");
});

/**
 * Moves anything past its due date into Overdue. Called by the cron route and
 * on demand from the invoices page.
 */
export async function refreshOverdueStatuses(): Promise<number> {
  const result = (await db.execute(sql`
    UPDATE invoices
       SET status = 'overdue', updated_at = now()
     WHERE deleted_at IS NULL
       AND status IN ('sent','part_paid')
       AND balance_cents > 0
       AND due_date < CURRENT_DATE
    RETURNING id
  `)) as unknown as Array<{ id: string }>;
  return result.length;
}
