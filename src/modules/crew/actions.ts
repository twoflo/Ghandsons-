"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { timeEntries, workerProfiles, users } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { costForMinutes } from "@/lib/money";
import { isoDate } from "@/lib/dates";
import { fail, ok } from "@/lib/result";

const ClockOnSchema = z.object({
  jobId: z.string().uuid("Pick a job before you clock on."),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
});

/**
 * Clocking on snapshots the worker's rates onto the entry. A pay rise next
 * month must never rewrite the cost of work already done.
 */
export const clockOn = action("time.logOwn", ClockOnSchema, async (input, user) => {
  const [existing] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, user.id), eq(timeEntries.status, "open"), isNull(timeEntries.deletedAt)))
    .limit(1);

  if (existing) {
    return fail("You're already clocked on. Clock off first, then start the new job.");
  }

  const [profile] = await db
    .select()
    .from(workerProfiles)
    .where(eq(workerProfiles.userId, user.id))
    .limit(1);

  const now = new Date();

  await db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(timeEntries)
      .values({
        userId: user.id,
        jobId: input.jobId,
        workDate: isoDate(now),
        startedAt: now,
        status: "open",
        source: "clock",
        costRateCents: profile?.costRateCents ?? 0,
        chargeRateCents: profile?.chargeRateCents ?? 0,
        startLatitude: input.latitude ?? null,
        startLongitude: input.longitude ?? null,
        createdBy: user.id,
      })
      .returning({ id: timeEntries.id });

    await recordAudit(tx, {
      entityType: "time_entry",
      entityId: entry!.id,
      action: "create",
      summary: `${user.fullName} clocked on`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/timesheets");
  return ok(undefined, "Clocked on. Have a good one.");
});

const ClockOffSchema = z.object({
  breakMinutes: z.coerce.number().int().min(0).max(480).default(0),
  description: z.string().trim().max(500).optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
});

export const clockOff = action("time.logOwn", ClockOffSchema, async (input, user) => {
  const [entry] = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, user.id), eq(timeEntries.status, "open"), isNull(timeEntries.deletedAt)))
    .limit(1);

  if (!entry) return fail("You're not clocked on at the moment.");
  if (!entry.startedAt) return fail("That shift is missing a start time. Add the hours by hand instead.");

  const now = new Date();
  const rawMinutes = Math.round((now.getTime() - entry.startedAt.getTime()) / 60_000);
  const minutes = Math.max(0, Math.min(1440, rawMinutes - input.breakMinutes));

  if (rawMinutes < 1) {
    return fail("That shift is under a minute. Clock on again when you actually start.");
  }
  if (input.breakMinutes >= rawMinutes) {
    return fail("The break is longer than the shift. Check the break time.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(timeEntries)
      .set({
        endedAt: now,
        breakMinutes: input.breakMinutes,
        minutes,
        description: input.description || entry.description,
        status: "draft",
        costCents: costForMinutes(minutes, entry.costRateCents),
        chargeCents: costForMinutes(minutes, entry.chargeRateCents),
        endLatitude: input.latitude ?? null,
        endLongitude: input.longitude ?? null,
        updatedAt: now,
      })
      .where(eq(timeEntries.id, entry.id));

    await recordAudit(tx, {
      entityType: "time_entry",
      entityId: entry.id,
      action: "update",
      summary: `${user.fullName} clocked off after ${(minutes / 60).toFixed(2)} hrs`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: costForMinutes(minutes, entry.costRateCents),
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/timesheets");
  return ok(undefined, `Clocked off — ${(minutes / 60).toFixed(2)} hours logged.`);
});

const RatesSchema = z.object({
  userId: z.string().uuid(),
  costRateCents: z.coerce.number().int().min(0).max(100_000_00),
  chargeRateCents: z.coerce.number().int().min(0).max(100_000_00),
  employmentType: z.enum(["employee", "subcontractor"]),
  trade: z.string().trim().max(120).optional(),
  standardHoursPerWeek: z.coerce.number().int().min(0).max(80).default(38),
  abn: z.string().trim().max(20).optional(),
});

export const saveWorkerRates = action("crew.manage", RatesSchema, async (input, user) => {
  const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target) return fail("We couldn't find that person.");

  const [before] = await db
    .select()
    .from(workerProfiles)
    .where(eq(workerProfiles.userId, input.userId))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .insert(workerProfiles)
      .values({
        userId: input.userId,
        employmentType: input.employmentType,
        costRateCents: input.costRateCents,
        chargeRateCents: input.chargeRateCents,
        trade: input.trade ?? null,
        standardHoursPerWeek: input.standardHoursPerWeek,
        abn: input.abn ?? null,
      })
      .onConflictDoUpdate({
        target: workerProfiles.userId,
        set: {
          employmentType: input.employmentType,
          costRateCents: input.costRateCents,
          chargeRateCents: input.chargeRateCents,
          trade: input.trade ?? null,
          standardHoursPerWeek: input.standardHoursPerWeek,
          abn: input.abn ?? null,
          updatedAt: new Date(),
        },
      });

    await recordAudit(tx, {
      entityType: "worker_profile",
      entityId: input.userId,
      action: "update",
      summary: `Updated pay and charge rates for ${target.fullName}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      changes: {
        costRateCents: { from: before?.costRateCents ?? null, to: input.costRateCents },
        chargeRateCents: { from: before?.chargeRateCents ?? null, to: input.chargeRateCents },
      },
    });
  });

  revalidatePath("/crew");
  return ok(undefined, "Rates saved. Existing timesheets keep their old rates.");
});

/** Used by the "who's on" panel to refresh elapsed time without a full reload. */
export async function getElapsedMinutes(entryId: string): Promise<number> {
  const result = (await db.execute(
    sql`SELECT (EXTRACT(EPOCH FROM (now() - started_at)) / 60)::int AS m
        FROM time_entries WHERE id = ${entryId}`,
  )) as unknown as Array<{ m: number }>;
  return result[0]?.m ?? 0;
}
