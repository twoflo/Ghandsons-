"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries, timesheetWeeks, workerProfiles } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { costForMinutes, formatMoney, formatHours } from "@/lib/money";
import { isoDate, formatDate } from "@/lib/dates";
import { fail, ok } from "@/lib/result";
import { dateField } from "@/modules/jobs/validation";

const ManualEntrySchema = z
  .object({
    id: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    jobId: z.string().uuid("Pick a job so the hours land somewhere."),
    workDate: dateField,
    /** Typed as hours ("7.5") because that's how a timesheet is filled in. */
    hours: z
      .union([z.string(), z.number()])
      .transform((v) => {
        const n = typeof v === "number" ? v : Number.parseFloat(String(v).replace(/,/g, ""));
        return Number.isFinite(n) ? n : Number.NaN;
      })
      .refine((n) => Number.isFinite(n), "Enter the hours as a number, like 7.5.")
      .refine((n) => n > 0, "That has to be more than zero.")
      .refine((n) => n <= 24, "There aren't that many hours in a day."),
    breakMinutes: z.coerce.number().int().min(0).max(480).default(0),
    description: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.workDate !== null, { message: "Which day was this?", path: ["workDate"] });

/**
 * Typing hours in by hand — the fallback for when someone forgot to clock
 * on, which is most Fridays.
 *
 * Rates are snapshotted onto the entry from the worker's profile at the time
 * it's written, exactly as clocking on does, so both routes cost a job the
 * same way and a later pay rise never rewrites history.
 */
export const saveManualTimeEntry = action("time.logOwn", ManualEntrySchema, async (input, user) => {
  // Only owner/office may log time for someone else.
  const targetUserId =
    input.userId && input.userId !== user.id
      ? user.role === "owner" || user.role === "office"
        ? input.userId
        : null
      : user.id;

  if (!targetUserId) {
    return fail("You can only log your own hours.");
  }

  const minutes = Math.max(0, Math.round(input.hours * 60) - input.breakMinutes);
  if (minutes === 0) {
    return fail("The break is as long as the shift. Check the numbers.");
  }

  const [profile] = await db
    .select()
    .from(workerProfiles)
    .where(eq(workerProfiles.userId, targetUserId))
    .limit(1);

  const entryId = await db.transaction(async (tx) => {
    if (input.id) {
      const [before] = await tx.select().from(timeEntries).where(eq(timeEntries.id, input.id)).limit(1);
      if (!before) throw new Error("That entry no longer exists.");
      if (before.status === "approved" && user.role !== "owner") {
        throw new Error("That week has been approved. Ask the owner if it needs changing.");
      }

      await tx
        .update(timeEntries)
        .set({
          jobId: input.jobId,
          workDate: input.workDate!,
          breakMinutes: input.breakMinutes,
          minutes,
          description: input.description ?? null,
          costCents: costForMinutes(minutes, before.costRateCents),
          chargeCents: costForMinutes(minutes, before.chargeRateCents),
          status: before.status === "rejected" ? "draft" : before.status,
          rejectedReason: null,
          updatedAt: new Date(),
        })
        .where(eq(timeEntries.id, input.id));

      await recordAudit(tx, {
        entityType: "time_entry",
        entityId: input.id,
        action: "update",
        summary: `Changed ${formatHours(before.minutes)} to ${formatHours(minutes)} on ${formatDate(input.workDate!)}`,
        actorUserId: user.id,
        actorLabel: user.fullName,
      });
      return input.id;
    }

    const costRate = profile?.costRateCents ?? 0;
    const chargeRate = profile?.chargeRateCents ?? 0;

    const [created] = await tx
      .insert(timeEntries)
      .values({
        userId: targetUserId,
        jobId: input.jobId,
        workDate: input.workDate!,
        breakMinutes: input.breakMinutes,
        minutes,
        description: input.description ?? null,
        status: "draft",
        source: "manual",
        costRateCents: costRate,
        chargeRateCents: chargeRate,
        costCents: costForMinutes(minutes, costRate),
        chargeCents: costForMinutes(minutes, chargeRate),
        createdBy: user.id,
      })
      .returning({ id: timeEntries.id });

    await recordAudit(tx, {
      entityType: "time_entry",
      entityId: created!.id,
      action: "create",
      summary: `${formatHours(minutes)} logged by hand on ${formatDate(input.workDate!)}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: costForMinutes(minutes, costRate),
    });

    return created!.id;
  });

  revalidatePath("/timesheets");
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath("/dashboard");
  return ok({ id: entryId }, "Hours saved.");
});

const DeleteEntrySchema = z.object({ entryId: z.string().uuid() });

export const deleteTimeEntry = action("time.logOwn", DeleteEntrySchema, async (input, user) => {
  const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, input.entryId)).limit(1);
  if (!entry) return fail("That entry no longer exists.");
  if (entry.userId !== user.id && user.role === "field") {
    return fail("You can only remove your own hours.");
  }
  if (entry.status === "approved" && user.role !== "owner") {
    return fail("That's been approved. Ask the owner to change it.");
  }

  await db.transaction(async (tx) => {
    await tx.update(timeEntries).set({ deletedAt: new Date() }).where(eq(timeEntries.id, input.entryId));
    await recordAudit(tx, {
      entityType: "time_entry",
      entityId: input.entryId,
      action: "delete",
      summary: `Removed ${formatHours(entry.minutes)} from ${formatDate(entry.workDate)}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/timesheets");
  if (entry.jobId) revalidatePath(`/jobs/${entry.jobId}`);
  return ok(undefined, "Removed.");
});

const WeekSchema = z.object({
  userId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Hand a week to the owner. Nothing can be submitted while still clocked on. */
export const submitTimesheetWeek = action("time.logOwn", WeekSchema, async (input, user) => {
  if (input.userId !== user.id && user.role === "field") {
    return fail("You can only submit your own timesheet.");
  }

  const entries = await weekEntries(input.userId, input.weekStart);
  if (entries.length === 0) return fail("There are no hours in that week.");
  if (entries.some((e) => e.status === "open")) {
    return fail("You're still clocked on. Clock off first, then submit the week.");
  }
  if (entries.some((e) => !e.jobId)) {
    return fail("Some hours aren't against a job. Put a job on them, then submit.");
  }

  const totals = sumEntries(entries);

  await db.transaction(async (tx) => {
    const [week] = await tx
      .insert(timesheetWeeks)
      .values({
        userId: input.userId,
        weekStart: input.weekStart,
        status: "submitted",
        submittedAt: new Date(),
        ...totals,
      })
      .onConflictDoNothing()
      .returning({ id: timesheetWeeks.id });

    const weekId = week?.id ?? (await findWeek(tx, input.userId, input.weekStart));

    if (weekId) {
      await tx
        .update(timesheetWeeks)
        .set({ status: "submitted", submittedAt: new Date(), ...totals, updatedAt: new Date() })
        .where(eq(timesheetWeeks.id, weekId));
    }

    await tx
      .update(timeEntries)
      .set({ status: "submitted", timesheetWeekId: weekId ?? null, rejectedReason: null, updatedAt: new Date() })
      .where(inArray(timeEntries.id, entries.filter((e) => e.status !== "approved").map((e) => e.id)));

    await recordAudit(tx, {
      entityType: "timesheet",
      entityId: input.userId,
      action: "update",
      summary: `Timesheet for the week of ${formatDate(input.weekStart)} submitted — ${formatHours(totals.totalMinutes)}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: totals.totalCostCents,
    });
  });

  revalidatePath("/timesheets");
  revalidatePath("/dashboard");
  return ok(undefined, "Sent for approval.");
});

/**
 * Approving is what turns hours into cost on a job — the job_labour_actuals
 * view only counts approved time. That's deliberate: the owner sees what the
 * job has actually committed to, not what somebody typed in on a Friday.
 */
export const approveTimesheetWeek = action("time.approve", WeekSchema, async (input, user) => {
  const entries = await weekEntries(input.userId, input.weekStart);
  if (entries.length === 0) return fail("There are no hours in that week.");

  const totals = sumEntries(entries);
  const now = new Date();

  await db.transaction(async (tx) => {
    const weekId = await upsertWeek(tx, input.userId, input.weekStart, {
      status: "approved",
      approvedBy: user.id,
      approvedAt: now,
      rejectedReason: null,
      ...totals,
    });

    await tx
      .update(timeEntries)
      .set({
        status: "approved",
        approvedBy: user.id,
        approvedAt: now,
        timesheetWeekId: weekId,
        rejectedReason: null,
        updatedAt: now,
      })
      .where(inArray(timeEntries.id, entries.map((e) => e.id)));

    await recordAudit(tx, {
      entityType: "timesheet",
      entityId: input.userId,
      action: "approve",
      summary: `Approved the week of ${formatDate(input.weekStart)} — ${formatHours(totals.totalMinutes)}, ${formatMoney(totals.totalCostCents)} of labour`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: totals.totalCostCents,
    });
  });

  revalidatePath("/timesheets");
  revalidatePath("/jobs");
  revalidatePath("/dashboard");
  return ok(undefined, `Approved — ${formatHours(totals.totalMinutes)} now counts against the jobs.`);
});

const RejectSchema = WeekSchema.extend({
  reason: z.string().trim().min(3, "Say what needs fixing — they can't guess."),
});

export const rejectTimesheetWeek = action("time.approve", RejectSchema, async (input, user) => {
  const entries = await weekEntries(input.userId, input.weekStart);
  if (entries.length === 0) return fail("There are no hours in that week.");

  await db.transaction(async (tx) => {
    await upsertWeek(tx, input.userId, input.weekStart, {
      status: "rejected",
      rejectedReason: input.reason,
      ...sumEntries(entries),
    });

    await tx
      .update(timeEntries)
      .set({ status: "rejected", rejectedReason: input.reason, updatedAt: new Date() })
      .where(inArray(timeEntries.id, entries.filter((e) => e.status !== "approved").map((e) => e.id)));

    await recordAudit(tx, {
      entityType: "timesheet",
      entityId: input.userId,
      action: "reject",
      summary: `Sent back the week of ${formatDate(input.weekStart)} — ${input.reason}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/timesheets");
  return ok(undefined, "Sent back with your note.");
});

/* -------------------------------- helpers -------------------------------- */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function weekEntries(userId: string, weekStart: string) {
  const end = isoDate(new Date(new Date(`${weekStart}T00:00:00`).getTime() + 6 * 86_400_000));
  return db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.workDate, weekStart),
        lte(timeEntries.workDate, end),
        isNull(timeEntries.deletedAt),
      ),
    );
}

function sumEntries(entries: Array<{ minutes: number; costCents: number; chargeCents: number }>) {
  return {
    totalMinutes: entries.reduce((a, e) => a + e.minutes, 0),
    totalCostCents: entries.reduce((a, e) => a + e.costCents, 0),
    totalChargeCents: entries.reduce((a, e) => a + e.chargeCents, 0),
  };
}

async function findWeek(tx: Tx, userId: string, weekStart: string): Promise<string | null> {
  const [row] = await tx
    .select({ id: timesheetWeeks.id })
    .from(timesheetWeeks)
    .where(and(eq(timesheetWeeks.userId, userId), eq(timesheetWeeks.weekStart, weekStart)))
    .limit(1);
  return row?.id ?? null;
}

type WeekPatch = Partial<typeof timesheetWeeks.$inferInsert>;

async function upsertWeek(
  tx: Tx,
  userId: string,
  weekStart: string,
  values: WeekPatch,
): Promise<string> {
  const existing = await findWeek(tx, userId, weekStart);
  if (existing) {
    await tx
      .update(timesheetWeeks)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(timesheetWeeks.id, existing));
    return existing;
  }
  const [created] = await tx
    .insert(timesheetWeeks)
    .values({ ...values, userId, weekStart })
    .returning({ id: timesheetWeeks.id });
  return created!.id;
}

