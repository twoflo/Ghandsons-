"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { expenses, expenseLines, suppliers, supplierAliases } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit, diffFields } from "@/lib/audit";
import { formatMoney, exTaxFromInclusive, GST_BP } from "@/lib/money";
import { today } from "@/lib/dates";
import { fail, ok } from "@/lib/result";
import { moneyField, dateField } from "@/modules/jobs/validation";

const ExpenseSchema = z
  .object({
    id: z.string().uuid().optional(),
    jobId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
    supplierId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
    supplierNameRaw: z.string().trim().max(200).optional(),
    categoryId: z.string().uuid("Pick a category so it lands in the right place."),
    expenseDate: dateField,
    description: z.string().trim().min(2, "What was it for?").max(500),
    /** The owner types the total off the docket; GST is worked out from it. */
    totalCents: moneyField.refine((v) => v > 0, "Enter the amount on the receipt."),
    /** Blank means "work out 1/11th of the total", which is right for a normal AU tax invoice. */
    taxCents: z.union([z.string(), z.number()]).optional(),
    hasGst: z.coerce.boolean().default(true),
    isBillable: z.coerce.boolean().default(true),
    paymentMethod: z.enum(["bank_transfer", "card", "cash", "cheque", "direct_debit", "other"]).default("card"),
    reference: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    receiptFileId: z.string().uuid().nullable().optional(),
    receiptUploadId: z.string().uuid().nullable().optional(),
    purchaseOrderId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
    source: z.enum(["manual", "receipt", "purchase_order", "import"]).default("manual"),
    lines: z
      .array(
        z.object({
          description: z.string().trim().max(300),
          quantity: z.union([z.string(), z.number()]).default("1"),
          unit: z.string().trim().max(20).default("ea"),
          unitPriceCents: moneyField,
          lineTotalCents: moneyField,
          extractionConfidence: z.coerce.number().int().min(0).max(100).nullable().optional(),
        }),
      )
      .optional(),
  })
  .transform((v) => {
    /* Work out the GST split once, here, so the row always satisfies the
     * expenses_totals_consistent constraint no matter which path wrote it. */
    let taxCents: number;
    if (!v.hasGst) {
      taxCents = 0;
    } else if (v.taxCents !== undefined && v.taxCents !== "") {
      const raw = typeof v.taxCents === "number" ? v.taxCents : Number.parseFloat(String(v.taxCents).replace(/[$,\s]/g, ""));
      taxCents = Number.isFinite(raw) ? Math.round(raw * 100) : 0;
    } else {
      taxCents = v.totalCents - exTaxFromInclusive(v.totalCents, GST_BP);
    }
    taxCents = Math.max(0, Math.min(taxCents, v.totalCents));
    return { ...v, taxCents, subtotalCents: v.totalCents - taxCents };
  });

export const saveExpense = action("expenses.create", ExpenseSchema, async (input, user) => {
  const expenseId = await db.transaction(async (tx) => {
    const values = {
      jobId: input.jobId,
      supplierId: input.supplierId,
      supplierNameRaw: input.supplierNameRaw ?? null,
      categoryId: input.categoryId,
      expenseDate: input.expenseDate ?? today(),
      description: input.description,
      subtotalCents: input.subtotalCents,
      taxCents: input.taxCents,
      totalCents: input.totalCents,
      isBillable: input.isBillable,
      paymentMethod: input.paymentMethod,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      receiptFileId: input.receiptFileId ?? null,
      receiptUploadId: input.receiptUploadId ?? null,
      purchaseOrderId: input.purchaseOrderId,
      source: input.source,
      updatedAt: new Date(),
    };

    let id = input.id;

    if (id) {
      const [before] = await tx.select().from(expenses).where(eq(expenses.id, id)).limit(1);
      if (!before) throw new Error("That expense no longer exists.");
      if (before.billedInvoiceLineId) {
        throw new Error(
          "This expense has already been charged on to an invoice. Remove it from the invoice first if it needs changing.",
        );
      }

      await tx.update(expenses).set(values).where(eq(expenses.id, id));

      await recordAudit(tx, {
        entityType: "expense",
        entityId: id,
        action: "update",
        summary: `Updated expense ${input.description} — ${formatMoney(input.totalCents)}`,
        actorUserId: user.id,
        actorLabel: user.fullName,
        amountCents: input.totalCents,
        changes: diffFields(before as never, values as never, [
          "totalCents", "jobId", "categoryId", "isBillable", "expenseDate",
        ]),
      });
    } else {
      const [created] = await tx
        .insert(expenses)
        .values({ ...values, createdBy: user.id })
        .returning({ id: expenses.id });
      id = created!.id;

      await recordAudit(tx, {
        entityType: "expense",
        entityId: id,
        action: "create",
        summary: `${formatMoney(input.totalCents)} expense — ${input.description}`,
        actorUserId: user.id,
        actorLabel: user.fullName,
        amountCents: input.totalCents,
      });
    }

    if (input.lines) {
      await tx.delete(expenseLines).where(eq(expenseLines.expenseId, id));
      if (input.lines.length) {
        await tx.insert(expenseLines).values(
          input.lines.map((line, i) => ({
            expenseId: id!,
            sortOrder: i,
            description: line.description || "Item",
            quantity: String(line.quantity),
            unit: line.unit,
            unitPriceCents: line.unitPriceCents,
            lineTotalCents: line.lineTotalCents,
            extractionConfidence: line.extractionConfidence ?? null,
          })),
        );
      }
    }

    /* Remember how this supplier's name printed, so the next receipt from
     * them matches without anyone having to teach it twice. */
    if (input.supplierId && input.supplierNameRaw) {
      const existing = await tx
        .select({ id: supplierAliases.id })
        .from(supplierAliases)
        .where(eq(supplierAliases.alias, input.supplierNameRaw))
        .limit(1);
      if (existing.length === 0) {
        await tx.insert(supplierAliases).values({
          supplierId: input.supplierId,
          alias: input.supplierNameRaw,
        });
      }
    }

    return id;
  });

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${expenseId}`);
  if (input.jobId) revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath("/dashboard");
  return ok({ id: expenseId }, input.id ? "Expense saved." : "Expense saved.");
});

const DeleteSchema = z.object({ expenseId: z.string().uuid() });

export const archiveExpense = action("expenses.delete", DeleteSchema, async (input, user) => {
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, input.expenseId)).limit(1);
  if (!expense) return fail("That expense no longer exists.");
  if (expense.billedInvoiceLineId) {
    return fail("It's on an invoice. Take it off the invoice before archiving it.");
  }

  await db.transaction(async (tx) => {
    await tx.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, input.expenseId));
    await recordAudit(tx, {
      entityType: "expense",
      entityId: input.expenseId,
      action: "delete",
      summary: `Archived expense ${expense.description} — ${formatMoney(expense.totalCents)}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: expense.totalCents,
    });
  });

  revalidatePath("/expenses");
  if (expense.jobId) revalidatePath(`/jobs/${expense.jobId}`);
  return ok(undefined, "Expense archived. The receipt image is kept.");
});

const SupplierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Enter the supplier's name."),
  abn: z.string().trim().max(20).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  suburb: z.string().trim().max(120).optional(),
  state: z.string().trim().max(20).optional(),
  postcode: z.string().trim().max(10).optional(),
  accountNumber: z.string().trim().max(60).optional(),
  contactName: z.string().trim().max(120).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(120).default(30),
  defaultCategoryId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
  notes: z.string().trim().max(2000).optional(),
});

export const saveSupplier = action("suppliers.manage", SupplierSchema, async (input, user) => {
  const id = await db.transaction(async (tx) => {
    const values = {
      name: input.name,
      abn: input.abn || null,
      email: input.email || null,
      phone: input.phone || null,
      addressLine1: input.addressLine1 || null,
      suburb: input.suburb || null,
      state: input.state || null,
      postcode: input.postcode || null,
      accountNumber: input.accountNumber || null,
      contactName: input.contactName || null,
      paymentTermsDays: input.paymentTermsDays,
      defaultCategoryId: input.defaultCategoryId,
      notes: input.notes || null,
      updatedAt: new Date(),
    };

    if (input.id) {
      await tx.update(suppliers).set(values).where(eq(suppliers.id, input.id));
      await recordAudit(tx, {
        entityType: "supplier",
        entityId: input.id,
        action: "update",
        summary: `Updated supplier ${input.name}`,
        actorUserId: user.id,
        actorLabel: user.fullName,
      });
      return input.id;
    }

    const [created] = await tx.insert(suppliers).values(values).returning({ id: suppliers.id });
    await recordAudit(tx, {
      entityType: "supplier",
      entityId: created!.id,
      action: "create",
      summary: `Added supplier ${input.name}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
    return created!.id;
  });

  revalidatePath("/suppliers");
  return ok({ id }, "Supplier saved.");
});
