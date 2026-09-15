"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { receiptUploads, expenses, expenseLines, supplierAliases } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { formatMoney, exTaxFromInclusive, GST_BP } from "@/lib/money";
import { today } from "@/lib/dates";
import { fail, ok } from "@/lib/result";
import { moneyField, dateField } from "@/modules/jobs/validation";

const ApproveSchema = z.object({
  uploadId: z.string().uuid(),
  jobId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
  supplierId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
  supplierNameRaw: z.string().trim().max(200).optional(),
  categoryId: z.string().uuid("Pick a category."),
  expenseDate: dateField,
  description: z.string().trim().min(2, "What was it for?").max(500),
  totalCents: moneyField.refine((v) => v > 0, "Enter the total off the receipt."),
  taxCents: moneyField.optional(),
  hasGst: z.coerce.boolean().default(true),
  isBillable: z.coerce.boolean().default(true),
  reference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  paymentMethod: z
    .enum(["bank_transfer", "card", "cash", "cheque", "direct_debit", "other"])
    .default("card"),
  /** Which fields the reviewer changed — feeds the accuracy report. */
  correctedFields: z.array(z.string()).default([]),
  /** Line items the reviewer kept, if the extractor found any. */
  lineItems: z
    .array(
      z.object({
        description: z.string().trim().max(300),
        quantity: z.string().default("1"),
        unitPriceCents: moneyField,
        lineTotalCents: moneyField,
        confidence: z.coerce.number().int().min(0).max(100).nullable().optional(),
      }),
    )
    .default([]),
});

/**
 * Turning a checked receipt into an expense.
 *
 * The original photo stays attached to the expense for good — that's the
 * whole point, and it's what the ATO's five-year record-keeping rule needs.
 * The upload row is kept too, with what the human changed, so the accuracy
 * of the extractor can be measured against reality rather than guessed at.
 */
export const approveReceipt = action("receipts.review", ApproveSchema, async (input, user) => {
  const [upload] = await db
    .select()
    .from(receiptUploads)
    .where(eq(receiptUploads.id, input.uploadId))
    .limit(1);

  if (!upload) return fail("That receipt is no longer in the queue.");
  if (upload.expenseId) {
    return fail("This one has already been saved as an expense.");
  }

  const taxCents = !input.hasGst
    ? 0
    : input.taxCents !== undefined
      ? Math.max(0, Math.min(input.taxCents, input.totalCents))
      : input.totalCents - exTaxFromInclusive(input.totalCents, GST_BP);

  const subtotalCents = input.totalCents - taxCents;

  const expenseId = await db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(expenses)
      .values({
        jobId: input.jobId,
        supplierId: input.supplierId,
        supplierNameRaw: input.supplierNameRaw ?? null,
        categoryId: input.categoryId,
        expenseDate: input.expenseDate ?? today(),
        description: input.description,
        subtotalCents,
        taxCents,
        totalCents: input.totalCents,
        isBillable: input.isBillable,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        source: "receipt",
        receiptFileId: upload.fileId,
        receiptUploadId: upload.id,
        createdBy: user.id,
      })
      .returning({ id: expenses.id });

    if (input.lineItems.length) {
      await tx.insert(expenseLines).values(
        input.lineItems.map((line, i) => ({
          expenseId: expense!.id,
          sortOrder: i,
          description: line.description || "Item",
          quantity: line.quantity || "1",
          unit: "ea",
          unitPriceCents: line.unitPriceCents,
          lineTotalCents: line.lineTotalCents,
          extractionConfidence: line.confidence ?? null,
        })),
      );
    }

    await tx
      .update(receiptUploads)
      .set({
        status: "approved",
        expenseId: expense!.id,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        correctedFields: input.correctedFields,
        updatedAt: new Date(),
      })
      .where(eq(receiptUploads.id, upload.id));

    /* Teach the matcher. Next time this supplier's name prints the same way
     * on a docket, it matches without anyone doing anything. */
    const printed = input.supplierNameRaw?.trim();
    if (input.supplierId && printed) {
      const existing = await tx
        .select({ id: supplierAliases.id })
        .from(supplierAliases)
        .where(eq(supplierAliases.alias, printed))
        .limit(1);
      if (existing.length === 0) {
        await tx.insert(supplierAliases).values({ supplierId: input.supplierId, alias: printed });
      }
    }

    await recordAudit(tx, {
      entityType: "expense",
      entityId: expense!.id,
      action: "create",
      summary:
        `Saved a photographed receipt as a ${formatMoney(input.totalCents)} expense — ${input.description}` +
        (input.correctedFields.length
          ? ` (corrected: ${input.correctedFields.join(", ")})`
          : " (nothing needed correcting)"),
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: input.totalCents,
    });

    return expense!.id;
  });

  revalidatePath("/receipts");
  revalidatePath("/expenses");
  if (input.jobId) revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath("/dashboard");

  return ok({ expenseId }, "Saved. The photo stays attached to it.");
});

const DiscardSchema = z.object({
  uploadId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

/** Bin a receipt that isn't one — a photo of a wall, a duplicate, a test shot. */
export const discardReceipt = action("receipts.review", DiscardSchema, async (input, user) => {
  const [upload] = await db
    .select()
    .from(receiptUploads)
    .where(eq(receiptUploads.id, input.uploadId))
    .limit(1);
  if (!upload) return fail("That receipt is no longer in the queue.");
  if (upload.expenseId) return fail("That one's already been saved as an expense.");

  await db.transaction(async (tx) => {
    await tx
      .update(receiptUploads)
      .set({
        status: "discarded",
        reviewedBy: user.id,
        reviewedAt: new Date(),
        errorMessage: input.reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(receiptUploads.id, input.uploadId));

    await recordAudit(tx, {
      entityType: "receipt_upload",
      entityId: input.uploadId,
      action: "delete",
      summary: `Binned a receipt from the queue${input.reason ? ` — ${input.reason}` : ""}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/receipts");
  return ok(undefined, "Binned. The photo is kept in case you need it.");
});

const RetrySchema = z.object({ uploadId: z.string().uuid() });

export const retryExtraction = action("receipts.review", RetrySchema, async (input, user) => {
  const { processReceiptUpload } = await import("@/lib/receipts/pipeline");
  await processReceiptUpload(input.uploadId);
  void user;
  revalidatePath("/receipts");
  revalidatePath(`/receipts/${input.uploadId}`);
  return ok(undefined, "Had another go at reading it.");
});
