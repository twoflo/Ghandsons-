"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { variations, variationLines, taxRates, jobs } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { formatMoney } from "@/lib/money";
import { today, formatDate } from "@/lib/dates";
import { fail, ok } from "@/lib/result";
import { calculateDocument, type RawLine } from "@/modules/quotes/calc";
import { moneyField, dateField } from "@/modules/jobs/validation";

const LineSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["labour", "material", "subcontractor", "plant", "other"]).default("material"),
  description: z.string().trim().min(1, "Every line needs a description."),
  quantity: z
    .union([z.string(), z.number()])
    .default("1")
    .transform((v) => {
      const n = typeof v === "number" ? v : Number.parseFloat(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : Number.NaN;
    })
    .refine((n) => Number.isFinite(n) && n >= 0, "Quantity has to be a number."),
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
});

const VariationSchema = z.object({
  id: z.string().uuid().optional(),
  jobId: z.string().uuid(),
  title: z.string().trim().min(3, "Give it a title the client will understand."),
  description: z.string().trim().max(4000).optional(),
  reason: z.enum(["client_request", "site_condition", "design_change", "error", "other"]).default("client_request"),
  raisedOn: dateField,
  markupBp: z.coerce.number().int().min(0).max(100_000).default(2000),
  timeImpactDays: z.coerce.number().int().min(0).max(365).default(0),
  lines: z.array(LineSchema).min(1, "Add at least one line."),
});

/**
 * A variation is a mini-quote against a live job: same cost-plus-markup
 * maths as the quote builder, same calculation function. What makes it
 * different is the approval — an unapproved variation is work you're not
 * getting paid for, which is where small builders lose money.
 */
export const saveVariation = action("variations.manage", VariationSchema, async (input, user) => {
  const rateRows = await db.select().from(taxRates);
  const rateMap = new Map(rateRows.map((r) => [r.id, r.rateBp]));
  const fallback = rateRows.find((r) => r.isDefault) ?? rateRows[0] ?? null;

  const raw: RawLine[] = input.lines.map((line, i) => ({
    id: line.id,
    sortOrder: i,
    kind: line.kind,
    description: line.description,
    quantity: String(line.quantity),
    unit: line.unit,
    unitCostCents: line.unitCostCents,
    markupBp: line.markupBp,
    taxRateId: line.taxRateId ?? fallback?.id ?? null,
    taxRateBp: rateMap.get(line.taxRateId ?? fallback?.id ?? "") ?? 0,
  }));

  const { lines, totals } = calculateDocument(raw, input.markupBp);

  const variationId = await db.transaction(async (tx) => {
    const values = {
      jobId: input.jobId,
      title: input.title,
      description: input.description ?? null,
      reason: input.reason,
      raisedOn: input.raisedOn ?? today(),
      markupBp: input.markupBp,
      timeImpactDays: input.timeImpactDays,
      costCents: totals.costTotalCents,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      updatedAt: new Date(),
    };

    let id = input.id;
    if (id) {
      const [before] = await tx.select().from(variations).where(eq(variations.id, id)).limit(1);
      if (!before) throw new Error("That variation no longer exists.");
      if (before.status === "approved" || before.status === "invoiced") {
        throw new Error(
          "This variation has been approved, so the price is locked. Raise another one if there's more to it.",
        );
      }
      await tx.update(variations).set(values).where(eq(variations.id, id));
    } else {
      const variationNumber = await nextNumber(tx, "variation");
      const [created] = await tx
        .insert(variations)
        .values({ ...values, variationNumber, status: "draft", createdBy: user.id })
        .returning({ id: variations.id });
      id = created!.id;
    }

    const keepIds = lines.map((l) => l.id).filter((v): v is string => Boolean(v));
    const existing = await tx
      .select({ id: variationLines.id })
      .from(variationLines)
      .where(eq(variationLines.variationId, id));
    const toDelete = existing.filter((e) => !keepIds.includes(e.id)).map((e) => e.id);
    if (toDelete.length) await tx.delete(variationLines).where(inArray(variationLines.id, toDelete));

    for (const line of lines) {
      const payload = {
        variationId: id,
        sortOrder: line.sortOrder,
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
        updatedAt: new Date(),
      };
      if (line.id) {
        await tx.update(variationLines).set(payload).where(eq(variationLines.id, line.id));
      } else {
        await tx.insert(variationLines).values(payload);
      }
    }

    await recordAudit(tx, {
      entityType: "variation",
      entityId: id,
      action: input.id ? "update" : "create",
      summary: `${input.id ? "Updated" : "Raised"} variation "${input.title}" — ${formatMoney(totals.totalCents)}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: totals.totalCents,
    });

    return id;
  });

  revalidatePath(`/jobs/${input.jobId}/variations`);
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath("/dashboard");
  return ok({ id: variationId }, input.id ? "Variation saved." : "Variation raised.");
});

const StatusSchema = z.object({
  variationId: z.string().uuid(),
  status: z.enum(["draft", "submitted", "approved", "rejected"]),
  approvedByName: z.string().trim().max(200).optional(),
  rejectedReason: z.string().trim().max(1000).optional(),
});

export const setVariationStatus = action("variations.manage", StatusSchema, async (input, user) => {
  const [variation] = await db
    .select()
    .from(variations)
    .where(eq(variations.id, input.variationId))
    .limit(1);
  if (!variation) return fail("That variation no longer exists.");
  if (variation.status === "invoiced") {
    return fail("It's already been invoiced, so it can't be changed.");
  }

  if (input.status === "approved") {
    if (user.role !== "owner") {
      return fail("Only the owner can approve a variation.");
    }
    if (!input.approvedByName?.trim()) {
      return fail("Who at the client approved it? Put their name on it.", {
        approvedByName: "Enter the name of the person who approved it.",
      });
    }
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(variations)
      .set({
        status: input.status,
        submittedAt: input.status === "submitted" ? (variation.submittedAt ?? now) : variation.submittedAt,
        approvedAt: input.status === "approved" ? now : null,
        approvedByName: input.status === "approved" ? (input.approvedByName ?? null) : null,
        rejectedAt: input.status === "rejected" ? now : null,
        rejectedReason: input.status === "rejected" ? (input.rejectedReason ?? null) : null,
        updatedAt: now,
      })
      .where(eq(variations.id, input.variationId));

    // Approved time impact pushes the programme out.
    if (input.status === "approved" && variation.timeImpactDays > 0) {
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, variation.jobId)).limit(1);
      if (job?.endDate) {
        const moved = new Date(`${job.endDate}T00:00:00`);
        moved.setDate(moved.getDate() + variation.timeImpactDays);
        await tx
          .update(jobs)
          .set({ endDate: moved.toISOString().slice(0, 10), updatedAt: now })
          .where(eq(jobs.id, job.id));
      }
    }

    await recordAudit(tx, {
      entityType: "variation",
      entityId: input.variationId,
      action:
        input.status === "approved" ? "approve" : input.status === "rejected" ? "reject" : "status_change",
      summary:
        input.status === "approved"
          ? `${variation.variationNumber} approved by ${input.approvedByName} — ${formatMoney(variation.totalCents)}` +
            (variation.timeImpactDays > 0 ? `, ${variation.timeImpactDays} days added to the programme` : "")
          : input.status === "rejected"
            ? `${variation.variationNumber} rejected${input.rejectedReason ? ` — ${input.rejectedReason}` : ""}`
            : `${variation.variationNumber} sent to the client for approval`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: variation.totalCents,
      changes: { status: { from: variation.status, to: input.status } },
    });
  });

  revalidatePath(`/jobs/${variation.jobId}/variations`);
  revalidatePath(`/jobs/${variation.jobId}`);
  revalidatePath("/dashboard");

  return ok(
    undefined,
    input.status === "approved"
      ? `Approved. It's added ${formatMoney(variation.subtotalCents)} to the contract and will come up on the next claim.`
      : input.status === "submitted"
        ? `Sent for approval on ${formatDate(today())}.`
        : "Updated.",
  );
});

const DeleteSchema = z.object({ variationId: z.string().uuid() });

export const archiveVariation = action("variations.manage", DeleteSchema, async (input, user) => {
  const [variation] = await db
    .select()
    .from(variations)
    .where(eq(variations.id, input.variationId))
    .limit(1);
  if (!variation) return fail("That variation no longer exists.");
  if (variation.status === "invoiced") return fail("It's on an invoice — void that first.");

  await db.transaction(async (tx) => {
    await tx.update(variations).set({ deletedAt: new Date() }).where(eq(variations.id, input.variationId));
    await recordAudit(tx, {
      entityType: "variation",
      entityId: input.variationId,
      action: "delete",
      summary: `Archived variation ${variation.variationNumber}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath(`/jobs/${variation.jobId}/variations`);
  return ok(undefined, "Archived.");
});
