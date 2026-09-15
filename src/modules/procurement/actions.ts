"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  purchaseOrders, purchaseOrderLines, purchaseOrderReceipts,
  purchaseOrderReceiptLines, purchaseOrderMatches, expenses, taxRates,
} from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { formatMoney, taxOn, lineTotal } from "@/lib/money";
import { today, formatDate } from "@/lib/dates";
import { fail, ok } from "@/lib/result";
import { moneyField, dateField } from "@/modules/jobs/validation";

const LineSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().trim().min(1, "Every line needs a description."),
  quantity: z
    .union([z.string(), z.number()])
    .default("1")
    .transform((v) => {
      const n = typeof v === "number" ? v : Number.parseFloat(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : Number.NaN;
    })
    .refine((n) => Number.isFinite(n) && n > 0, "Quantity has to be more than zero."),
  unit: z.string().trim().max(20).default("ea"),
  unitCostCents: moneyField,
  taxRateId: z.string().uuid().nullable().optional(),
});

const PoSchema = z.object({
  id: z.string().uuid().optional(),
  supplierId: z.string().uuid("Pick a supplier."),
  jobId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
  orderDate: dateField,
  expectedDate: dateField,
  deliverTo: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(LineSchema).min(1, "Add at least one line."),
});

export const savePurchaseOrder = action("po.manage", PoSchema, async (input, user) => {
  const rateRows = await db.select().from(taxRates);
  const rateMap = new Map(rateRows.map((r) => [r.id, r.rateBp]));
  const fallback = rateRows.find((r) => r.isDefault) ?? rateRows[0] ?? null;

  const priced = input.lines.map((line, index) => {
    const taxRateId = line.taxRateId ?? fallback?.id ?? null;
    const rateBp = rateMap.get(taxRateId ?? "") ?? 0;
    const lineSubtotalCents = lineTotal(line.quantity, line.unitCostCents);
    const lineTaxCents = taxOn(lineSubtotalCents, rateBp);
    return {
      ...line,
      index,
      taxRateId,
      lineSubtotalCents,
      lineTaxCents,
      lineTotalCents: lineSubtotalCents + lineTaxCents,
    };
  });

  const subtotalCents = priced.reduce((a, l) => a + l.lineSubtotalCents, 0);
  const taxCents = priced.reduce((a, l) => a + l.lineTaxCents, 0);

  const poId = await db.transaction(async (tx) => {
    const values = {
      supplierId: input.supplierId,
      jobId: input.jobId,
      orderDate: input.orderDate ?? today(),
      expectedDate: input.expectedDate,
      deliverTo: input.deliverTo ?? null,
      notes: input.notes ?? null,
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      updatedAt: new Date(),
    };

    let id = input.id;
    if (id) {
      const [before] = await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
      if (!before) throw new Error("That order no longer exists.");
      if (before.status === "received" || before.status === "invoiced") {
        throw new Error("That order has been delivered — it can't be changed now.");
      }
      await tx.update(purchaseOrders).set(values).where(eq(purchaseOrders.id, id));
    } else {
      const poNumber = await nextNumber(tx, "purchase_order");
      const [created] = await tx
        .insert(purchaseOrders)
        .values({ ...values, poNumber, status: "draft", createdBy: user.id })
        .returning({ id: purchaseOrders.id });
      id = created!.id;
    }

    const keepIds = priced.map((l) => l.id).filter((v): v is string => Boolean(v));
    const existing = await tx
      .select({ id: purchaseOrderLines.id })
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, id));
    const toDelete = existing.filter((e) => !keepIds.includes(e.id)).map((e) => e.id);
    if (toDelete.length) {
      await tx.delete(purchaseOrderLines).where(inArray(purchaseOrderLines.id, toDelete));
    }

    for (const line of priced) {
      const payload = {
        purchaseOrderId: id,
        sortOrder: line.index,
        description: line.description,
        quantity: String(line.quantity),
        unit: line.unit,
        unitCostCents: line.unitCostCents,
        taxRateId: line.taxRateId,
        lineSubtotalCents: line.lineSubtotalCents,
        lineTaxCents: line.lineTaxCents,
        lineTotalCents: line.lineTotalCents,
        updatedAt: new Date(),
      };
      if (line.id) {
        await tx.update(purchaseOrderLines).set(payload).where(eq(purchaseOrderLines.id, line.id));
      } else {
        await tx.insert(purchaseOrderLines).values(payload);
      }
    }

    await recordAudit(tx, {
      entityType: "purchase_order",
      entityId: id,
      action: input.id ? "update" : "create",
      summary: `${input.id ? "Updated" : "Raised"} a purchase order for ${formatMoney(subtotalCents + taxCents)}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: subtotalCents + taxCents,
    });

    return id;
  });

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${poId}`);
  if (input.jobId) revalidatePath(`/jobs/${input.jobId}`);
  return ok({ id: poId }, input.id ? "Order saved." : "Order raised as a draft.");
});

const SendSchema = z.object({ poId: z.string().uuid() });

export const sendPurchaseOrder = action("po.manage", SendSchema, async (input, user) => {
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.poId)).limit(1);
  if (!po) return fail("That order no longer exists.");
  if (po.status !== "draft") return ok(undefined, "Already sent.");

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(purchaseOrders.id, input.poId));
    await recordAudit(tx, {
      entityType: "purchase_order",
      entityId: input.poId,
      action: "send",
      summary: `Sent ${po.poNumber} — ${formatMoney(po.totalCents)}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: po.totalCents,
    });
  });

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${input.poId}`);
  if (po.jobId) revalidatePath(`/jobs/${po.jobId}`);
  return ok(undefined, "Marked as ordered. It now counts as committed cost on the job.");
});

const ReceiveSchema = z.object({
  poId: z.string().uuid(),
  receivedOn: dateField,
  docketNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  lines: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        quantity: z
          .union([z.string(), z.number()])
          .transform((v) => {
            const n = typeof v === "number" ? v : Number.parseFloat(String(v) || "0");
            return Number.isFinite(n) ? n : 0;
          })
          .refine((n) => n >= 0, "Can't receive a negative quantity."),
      }),
    )
    .min(1, "Tick off what turned up."),
});

/**
 * Booking in a delivery.
 *
 * Quantities are cumulative on the line, so a part delivery followed by the
 * back-order adds up correctly rather than overwriting. The PO's status
 * follows from what's been received, never set by hand — which is what makes
 * "what's still outstanding" trustworthy.
 */
export const receiveDelivery = action("po.manage", ReceiveSchema, async (input, user) => {
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.poId)).limit(1);
  if (!po) return fail("That order no longer exists.");

  const received = input.lines.filter((l) => l.quantity > 0);
  if (received.length === 0) return fail("Nothing was ticked off. What turned up?");

  await db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(purchaseOrderReceipts)
      .values({
        purchaseOrderId: input.poId,
        receivedOn: input.receivedOn ?? today(),
        docketNumber: input.docketNumber ?? null,
        notes: input.notes ?? null,
        receivedBy: user.id,
      })
      .returning({ id: purchaseOrderReceipts.id });

    await tx.insert(purchaseOrderReceiptLines).values(
      received.map((line) => ({
        receiptId: receipt!.id,
        purchaseOrderLineId: line.lineId,
        quantity: String(line.quantity),
      })),
    );

    for (const line of received) {
      await tx
        .update(purchaseOrderLines)
        .set({
          quantityReceived: sql`${purchaseOrderLines.quantityReceived} + ${String(line.quantity)}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrderLines.id, line.lineId));
    }

    const [{ outstanding }] = (await tx.execute(sql`
      SELECT COUNT(*)::int AS outstanding
      FROM purchase_order_lines
      WHERE purchase_order_id = ${input.poId} AND deleted_at IS NULL
        AND quantity_received < quantity
    `)) as unknown as Array<{ outstanding: number }>;

    await tx
      .update(purchaseOrders)
      .set({
        status: outstanding > 0 ? "part_received" : "received",
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrders.id, input.poId));

    await recordAudit(tx, {
      entityType: "purchase_order",
      entityId: input.poId,
      action: "update",
      summary:
        `Booked in a delivery on ${po.poNumber}` +
        (input.docketNumber ? ` (docket ${input.docketNumber})` : "") +
        (outstanding > 0 ? ` — ${outstanding} line${outstanding === 1 ? "" : "s"} still outstanding` : " — complete"),
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath(`/purchase-orders/${input.poId}`);
  revalidatePath("/purchase-orders");
  return ok(undefined, "Delivery booked in.");
});

const MatchSchema = z.object({
  poId: z.string().uuid(),
  expenseId: z.string().uuid(),
});

/**
 * Three-way match: what we ordered, what turned up, what they billed us.
 * The variance is what the owner actually looks at — a supplier invoice that
 * doesn't match the order is the most common way money leaks out of a job.
 */
export const matchExpenseToPo = action("po.manage", MatchSchema, async (input, user) => {
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.poId)).limit(1);
  const [expense] = await db.select().from(expenses).where(eq(expenses.id, input.expenseId)).limit(1);
  if (!po || !expense) return fail("We couldn't find the order or the expense.");

  const variance = expense.subtotalCents - po.subtotalCents;

  await db.transaction(async (tx) => {
    await tx.insert(purchaseOrderMatches).values({
      purchaseOrderId: input.poId,
      expenseId: input.expenseId,
      matchedAmountCents: expense.subtotalCents,
      varianceCents: variance,
      matchedBy: user.id,
    });

    await tx
      .update(expenses)
      .set({ purchaseOrderId: input.poId, updatedAt: new Date() })
      .where(eq(expenses.id, input.expenseId));

    await tx
      .update(purchaseOrders)
      .set({ status: "invoiced", updatedAt: new Date() })
      .where(eq(purchaseOrders.id, input.poId));

    await recordAudit(tx, {
      entityType: "purchase_order",
      entityId: input.poId,
      action: "update",
      summary:
        `Matched ${expense.description} (${formatMoney(expense.subtotalCents)}) to ${po.poNumber}` +
        (variance !== 0
          ? ` — ${formatMoney(Math.abs(variance))} ${variance > 0 ? "more" : "less"} than ordered`
          : " — exact match"),
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: variance,
    });
  });

  revalidatePath(`/purchase-orders/${input.poId}`);
  revalidatePath(`/expenses/${input.expenseId}`);
  return ok(
    undefined,
    variance === 0
      ? "Matched exactly to the order."
      : `Matched, but it's ${formatMoney(Math.abs(variance))} ${variance > 0 ? "more" : "less"} than you ordered.`,
  );
});

const CancelSchema = z.object({ poId: z.string().uuid(), reason: z.string().trim().max(500).optional() });

export const cancelPurchaseOrder = action("po.manage", CancelSchema, async (input, user) => {
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.poId)).limit(1);
  if (!po) return fail("That order no longer exists.");

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({ status: "cancelled", notes: input.reason ?? po.notes, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, input.poId));
    await recordAudit(tx, {
      entityType: "purchase_order",
      entityId: input.poId,
      action: "delete",
      summary: `Cancelled ${po.poNumber}${input.reason ? ` — ${input.reason}` : ""} (raised ${formatDate(po.orderDate)})`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${input.poId}`);
  return ok(undefined, "Cancelled. It no longer counts as committed cost.");
});
