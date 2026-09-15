"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { quotes, quoteLines, jobs, jobStatusHistory, taxRates } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { formatMoney, marginBp } from "@/lib/money";
import { fail, ok } from "@/lib/result";
import { calculateDocument, budgetFromLines, type RawLine } from "./calc";
import { moneyField, dateField } from "@/modules/jobs/validation";

const LineSchema = z.object({
  id: z.string().uuid().optional(),
  isHeading: z.coerce.boolean().default(false),
  kind: z.enum(["labour", "material", "subcontractor", "plant", "other"]).default("material"),
  description: z.string().trim().min(1, "Every line needs a description."),
  quantity: z
    .union([z.string(), z.number()])
    .default("1")
    .transform((v) => {
      const n = typeof v === "number" ? v : Number.parseFloat(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : Number.NaN;
    })
    .refine((n) => Number.isFinite(n), "Quantity has to be a number.")
    .refine((n) => n >= 0, "Quantity can't be negative.")
    .refine((n) => n <= 1_000_000, "That quantity looks wrong."),
  unit: z.string().trim().max(20).default("ea"),
  unitCostCents: moneyField,
  markupBp: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number.parseFloat(String(v));
      return Number.isFinite(n) ? Math.round(n) : null;
    }),
  taxRateId: z.string().uuid().nullable().optional(),
  priceBookItemId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
});

const QuoteSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid("Pick a client."),
  siteId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
  jobId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
  title: z.string().trim().min(3, "Give the quote a title the client will understand."),
  issueDate: dateField,
  validUntil: dateField,
  globalMarkupBp: z.coerce.number().int().min(0).max(100_000).default(2000),
  scopeOfWork: z.string().trim().max(8000).optional(),
  exclusions: z.string().trim().max(4000).optional(),
  terms: z.string().trim().max(8000).optional(),
  internalNotes: z.string().trim().max(4000).optional(),
  lines: z.array(LineSchema).min(1, "Add at least one line."),
});

async function taxRateMap() {
  const rates = await db.select().from(taxRates);
  return new Map(rates.map((r) => [r.id, r.rateBp]));
}

export const saveQuote = action("quotes.manage", QuoteSchema, async (input, user) => {
  const rates = await taxRateMap();
  const defaultRate = (await db.select().from(taxRates).where(eq(taxRates.isDefault, true)).limit(1))[0];

  const raw: RawLine[] = input.lines.map((line, i) => ({
    id: line.id,
    sortOrder: i,
    isHeading: line.isHeading,
    kind: line.kind,
    description: line.description,
    quantity: String(line.quantity),
    unit: line.unit,
    unitCostCents: line.unitCostCents,
    markupBp: line.markupBp,
    taxRateId: line.taxRateId ?? defaultRate?.id ?? null,
    taxRateBp: rates.get(line.taxRateId ?? defaultRate?.id ?? "") ?? 0,
    priceBookItemId: line.priceBookItemId ?? null,
    notes: line.notes ?? null,
  }));

  const { lines, totals } = calculateDocument(raw, input.globalMarkupBp);

  const quoteId = await db.transaction(async (tx) => {
    let id = input.id;

    const values = {
      clientId: input.clientId,
      siteId: input.siteId,
      jobId: input.jobId,
      title: input.title,
      issueDate: input.issueDate,
      validUntil: input.validUntil,
      globalMarkupBp: input.globalMarkupBp,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      costTotalCents: totals.costTotalCents,
      scopeOfWork: input.scopeOfWork ?? null,
      exclusions: input.exclusions ?? null,
      terms: input.terms ?? null,
      internalNotes: input.internalNotes ?? null,
      updatedAt: new Date(),
    };

    if (id) {
      const [before] = await tx.select().from(quotes).where(eq(quotes.id, id)).limit(1);
      if (!before) throw new Error("That quote no longer exists.");
      if (before.status === "accepted") {
        throw new Error(
          "This quote has been accepted, so it can't be edited. Raise a variation on the job instead.",
        );
      }

      await tx.update(quotes).set(values).where(eq(quotes.id, id));

      await recordAudit(tx, {
        entityType: "quote",
        entityId: id,
        action: "update",
        summary: `Updated quote ${before.quoteNumber} — now ${formatMoney(totals.totalCents)}`,
        actorUserId: user.id,
        actorLabel: user.fullName,
        amountCents: totals.totalCents,
        changes:
          before.totalCents !== totals.totalCents
            ? { totalCents: { from: before.totalCents, to: totals.totalCents } }
            : null,
      });
    } else {
      const quoteNumber = await nextNumber(tx, "quote");
      const [created] = await tx
        .insert(quotes)
        .values({ ...values, quoteNumber, status: "draft", createdBy: user.id })
        .returning({ id: quotes.id });
      id = created!.id;

      await recordAudit(tx, {
        entityType: "quote",
        entityId: id,
        action: "create",
        summary: `Created quote ${quoteNumber} for ${formatMoney(totals.totalCents)}`,
        actorUserId: user.id,
        actorLabel: user.fullName,
        amountCents: totals.totalCents,
      });
    }

    /* Lines are replaced wholesale: whatever the editor posted is the truth.
     * Removed lines are soft-deleted so an audit reader can still follow
     * what the client was originally shown. */
    const keepIds = lines.map((l) => l.id).filter((v): v is string => Boolean(v));
    const existing = await tx
      .select({ id: quoteLines.id })
      .from(quoteLines)
      .where(eq(quoteLines.quoteId, id));

    const toDelete = existing.filter((e) => !keepIds.includes(e.id)).map((e) => e.id);
    if (toDelete.length) {
      await tx.delete(quoteLines).where(inArray(quoteLines.id, toDelete));
    }

    for (const line of lines) {
      const payload = {
        quoteId: id,
        sortOrder: line.sortOrder,
        isHeading: line.isHeading ? 1 : 0,
        kind: line.kind,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitCostCents: line.unitCostCents,
        markupBp: line.markupBp,
        unitPriceCents: line.unitPriceCents,
        lineCostCents: line.lineCostCents,
        lineSubtotalCents: line.lineSubtotalCents,
        taxRateId: line.taxRateId ?? null,
        lineTaxCents: line.lineTaxCents,
        lineTotalCents: line.lineTotalCents,
        priceBookItemId: line.priceBookItemId ?? null,
        notes: line.notes ?? null,
        updatedAt: new Date(),
      };
      if (line.id) {
        await tx.update(quoteLines).set(payload).where(eq(quoteLines.id, line.id));
      } else {
        await tx.insert(quoteLines).values(payload);
      }
    }

    return id;
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  return ok({ id: quoteId }, input.id ? "Quote saved." : "Quote created.");
});

const StatusSchema = z.object({
  quoteId: z.string().uuid(),
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]),
  acceptedByName: z.string().trim().max(200).optional(),
  rejectedReason: z.string().trim().max(1000).optional(),
});

export const setQuoteStatus = action("quotes.manage", StatusSchema, async (input, user) => {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, input.quoteId)).limit(1);
  if (!quote) return fail("That quote no longer exists.");

  if (input.status === "accepted" && !input.acceptedByName?.trim()) {
    return fail("Who accepted it? Put their name in so there's a record.", {
      acceptedByName: "Enter the name of the person who accepted.",
    });
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(quotes)
      .set({
        status: input.status,
        sentAt: input.status === "sent" ? (quote.sentAt ?? now) : quote.sentAt,
        acceptedAt: input.status === "accepted" ? now : null,
        acceptedByName: input.status === "accepted" ? (input.acceptedByName ?? null) : null,
        rejectedAt: input.status === "rejected" ? now : null,
        rejectedReason: input.status === "rejected" ? (input.rejectedReason ?? null) : null,
        updatedAt: now,
      })
      .where(eq(quotes.id, input.quoteId));

    // Keep the linked job's stage honest.
    if (quote.jobId) {
      const target =
        input.status === "sent" ? "quoted" :
        input.status === "accepted" ? "won" :
        input.status === "rejected" ? "lost" : null;

      if (target) {
        const [job] = await tx.select().from(jobs).where(eq(jobs.id, quote.jobId)).limit(1);
        if (job && job.status !== target && ["lead", "quoted", "won"].includes(job.status)) {
          await tx.update(jobs).set({ status: target, updatedAt: now }).where(eq(jobs.id, quote.jobId));
          await tx.insert(jobStatusHistory).values({
            jobId: quote.jobId,
            fromStatus: job.status,
            toStatus: target,
            note: `Quote ${quote.quoteNumber} ${input.status}`,
            changedBy: user.id,
          });
        }
      }
    }

    await recordAudit(tx, {
      entityType: "quote",
      entityId: input.quoteId,
      action:
        input.status === "accepted" ? "approve" :
        input.status === "rejected" ? "reject" :
        input.status === "sent" ? "send" : "status_change",
      summary:
        input.status === "accepted"
          ? `Quote ${quote.quoteNumber} accepted by ${input.acceptedByName} — ${formatMoney(quote.totalCents)}`
          : `Quote ${quote.quoteNumber} marked ${input.status}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: quote.totalCents,
      changes: { status: { from: quote.status, to: input.status } },
    });
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${input.quoteId}`);
  revalidatePath("/dashboard");
  return ok(undefined, `Quote marked ${input.status}.`);
});

const ConvertSchema = z.object({
  quoteId: z.string().uuid(),
  startDate: dateField,
  endDate: dateField,
  jobTypeId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
});

/**
 * One tap from an accepted quote to a live job.
 *
 * The job's budget is the quote's COST by category and its contract value is
 * the quote's price ex GST — so the margin the owner quoted is the margin the
 * job is measured against from day one.
 */
export const convertQuoteToJob = action("jobs.manage", ConvertSchema, async (input, user) => {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, input.quoteId)).limit(1);
  if (!quote) return fail("That quote no longer exists.");
  if (quote.status !== "accepted") {
    return fail("Mark the quote accepted first — then it can become a job.");
  }
  if (quote.jobId) {
    const [existing] = await db.select().from(jobs).where(eq(jobs.id, quote.jobId)).limit(1);
    if (existing && existing.contractValueCents > 0) {
      return fail(`This quote already belongs to job ${existing.jobNumber}.`);
    }
  }

  const rates = await taxRateMap();
  const lineRows = await db
    .select()
    .from(quoteLines)
    .where(and(eq(quoteLines.quoteId, quote.id)));

  const { lines } = calculateDocument(
    lineRows.map((l, i) => ({
      id: l.id,
      sortOrder: l.sortOrder ?? i,
      isHeading: l.isHeading === 1,
      kind: l.kind as RawLine["kind"],
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitCostCents: l.unitCostCents,
      markupBp: l.markupBp,
      taxRateId: l.taxRateId,
      taxRateBp: rates.get(l.taxRateId ?? "") ?? 0,
    })),
    quote.globalMarkupBp,
  );

  const budget = budgetFromLines(lines);

  const jobId = await db.transaction(async (tx) => {
    let id = quote.jobId;

    if (id) {
      await tx
        .update(jobs)
        .set({
          contractValueCents: quote.subtotalCents,
          ...budget,
          targetMarginBp: marginBp(quote.costTotalCents, quote.subtotalCents),
          sourceQuoteId: quote.id,
          status: "won",
          startDate: input.startDate,
          endDate: input.endDate,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, id));
    } else {
      const jobNumber = await nextNumber(tx, "job");
      const [created] = await tx
        .insert(jobs)
        .values({
          jobNumber,
          title: quote.title,
          clientId: quote.clientId,
          siteId: quote.siteId,
          jobTypeId: input.jobTypeId,
          status: "won",
          description: quote.scopeOfWork,
          startDate: input.startDate,
          endDate: input.endDate,
          contractValueCents: quote.subtotalCents,
          ...budget,
          targetMarginBp: marginBp(quote.costTotalCents, quote.subtotalCents),
          sourceQuoteId: quote.id,
          createdBy: user.id,
        })
        .returning({ id: jobs.id });
      id = created!.id;

      await tx.insert(jobStatusHistory).values({
        jobId: id,
        fromStatus: null,
        toStatus: "won",
        note: `Created from accepted quote ${quote.quoteNumber}`,
        changedBy: user.id,
      });
    }

    await tx.update(quotes).set({ jobId: id, updatedAt: new Date() }).where(eq(quotes.id, quote.id));

    await recordAudit(tx, {
      entityType: "job",
      entityId: id,
      action: "create",
      summary: `Converted quote ${quote.quoteNumber} into a job — contract ${formatMoney(quote.subtotalCents)} ex GST, budget ${formatMoney(
        Object.values(budget).reduce((a, b) => a + b, 0),
      )}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: quote.subtotalCents,
    });

    return id;
  });

  revalidatePath("/jobs");
  revalidatePath("/quotes");
  return ok({ jobId }, "Job created with the quote's budget.");
});

const DuplicateSchema = z.object({ quoteId: z.string().uuid() });

/** Revise a quote without losing what the client was originally sent. */
export const reviseQuote = action("quotes.manage", DuplicateSchema, async (input, user) => {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, input.quoteId)).limit(1);
  if (!quote) return fail("That quote no longer exists.");

  const lineRows = await db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id));

  const newId = await db.transaction(async (tx) => {
    const quoteNumber = await nextNumber(tx, "quote");
    const [created] = await tx
      .insert(quotes)
      .values({
        quoteNumber,
        revision: quote.revision + 1,
        supersedesQuoteId: quote.id,
        clientId: quote.clientId,
        siteId: quote.siteId,
        jobId: quote.jobId,
        title: quote.title,
        status: "draft",
        issueDate: new Date().toISOString().slice(0, 10),
        validUntil: quote.validUntil,
        globalMarkupBp: quote.globalMarkupBp,
        subtotalCents: quote.subtotalCents,
        taxCents: quote.taxCents,
        totalCents: quote.totalCents,
        costTotalCents: quote.costTotalCents,
        scopeOfWork: quote.scopeOfWork,
        exclusions: quote.exclusions,
        terms: quote.terms,
        internalNotes: quote.internalNotes,
        createdBy: user.id,
      })
      .returning({ id: quotes.id });

    if (lineRows.length) {
      await tx.insert(quoteLines).values(
        lineRows.map(({ id: _id, createdAt: _c, updatedAt: _u, ...line }) => ({
          ...line,
          quoteId: created!.id,
        })),
      );
    }

    await tx.update(quotes).set({ status: "superseded" }).where(eq(quotes.id, quote.id));

    await recordAudit(tx, {
      entityType: "quote",
      entityId: created!.id,
      action: "create",
      summary: `Revised ${quote.quoteNumber} as ${quoteNumber} (rev ${quote.revision + 1})`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });

    return created!.id;
  });

  revalidatePath("/quotes");
  return ok({ id: newId }, "New revision created. The old one is marked superseded.");
});

export const archiveQuote = action("quotes.delete", DuplicateSchema, async (input, user) => {
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, input.quoteId)).limit(1);
  if (!quote) return fail("That quote no longer exists.");
  if (quote.status === "accepted") {
    return fail("An accepted quote can't be archived — the job's budget depends on it.");
  }

  await db.transaction(async (tx) => {
    await tx.update(quotes).set({ deletedAt: new Date() }).where(eq(quotes.id, input.quoteId));
    await recordAudit(tx, {
      entityType: "quote",
      entityId: input.quoteId,
      action: "delete",
      summary: `Archived quote ${quote.quoteNumber}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/quotes");
  return ok(undefined, "Quote archived.");
});
