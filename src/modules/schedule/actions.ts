"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { scheduleEvents, scheduleAssignments, jobs, jobStatusHistory } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { fail, ok } from "@/lib/result";
import { formatDate } from "@/lib/dates";

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a real date.");

const EventSchema = z
  .object({
    id: z.string().uuid().optional(),
    jobId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
    title: z.string().trim().max(200).optional(),
    kind: z.enum(["work", "leave", "delivery", "inspection", "other"]).default("work"),
    startDate: isoDay,
    endDate: isoDay,
    notes: z.string().trim().max(2000).optional(),
    colour: z.string().trim().max(20).optional(),
    userIds: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "The last day can't be before the first.",
    path: ["endDate"],
  })
  .refine((v) => v.jobId || (v.title && v.title.length > 1), {
    message: "Pick a job, or give the block a name.",
    path: ["title"],
  });

/**
 * Blocks are stored as timestamps but booked as whole days, so 07:00 to
 * 15:30 is baked in here. The calendar only ever shows days, and treating a
 * day as atomic is what makes drag-and-drop and the clash check simple.
 */
function dayRange(startDate: string, endDate: string) {
  return {
    startAt: new Date(`${startDate}T07:00:00`),
    endAt: new Date(`${endDate}T15:30:00`),
  };
}

export const saveScheduleEvent = action("schedule.manage", EventSchema, async (input, user) => {
  const { startAt, endAt } = dayRange(input.startDate, input.endDate);

  const eventId = await db.transaction(async (tx) => {
    let jobTitle: string | null = null;
    if (input.jobId) {
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
      if (!job) throw new Error("That job no longer exists.");
      jobTitle = `${job.jobNumber} — ${job.title}`;

      // Booking work on a won job is what makes it scheduled.
      if (job.status === "won" && input.kind === "work") {
        await tx.update(jobs).set({ status: "scheduled", updatedAt: new Date() }).where(eq(jobs.id, job.id));
        await tx.insert(jobStatusHistory).values({
          jobId: job.id,
          fromStatus: job.status,
          toStatus: "scheduled",
          note: `Booked in for ${formatDate(input.startDate)}`,
          changedBy: user.id,
        });
      }
    }

    const values = {
      jobId: input.jobId,
      title: input.title || jobTitle || "Work",
      kind: input.kind,
      startAt,
      endAt,
      allDay: true,
      notes: input.notes ?? null,
      colour: input.colour ?? null,
      updatedAt: new Date(),
    };

    let id = input.id;
    if (id) {
      await tx.update(scheduleEvents).set(values).where(eq(scheduleEvents.id, id));
    } else {
      const [created] = await tx
        .insert(scheduleEvents)
        .values({ ...values, createdBy: user.id })
        .returning({ id: scheduleEvents.id });
      id = created!.id;
    }

    await syncAssignments(tx, id, input.userIds);

    await recordAudit(tx, {
      entityType: "schedule_event",
      entityId: id,
      action: input.id ? "update" : "create",
      summary: `${input.id ? "Changed" : "Booked"} ${values.title} for ${formatDate(input.startDate)}${
        input.endDate !== input.startDate ? ` to ${formatDate(input.endDate)}` : ""
      }`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });

    return id;
  });

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  if (input.jobId) revalidatePath(`/jobs/${input.jobId}`);
  return ok({ id: eventId }, input.id ? "Booking updated." : "Booked in.");
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function syncAssignments(tx: Tx, eventId: string, userIds: string[]) {
  const existing = await tx
    .select({ id: scheduleAssignments.id, userId: scheduleAssignments.userId })
    .from(scheduleAssignments)
    .where(and(eq(scheduleAssignments.eventId, eventId), isNull(scheduleAssignments.deletedAt)));

  const keep = new Set(userIds);
  const remove = existing.filter((e) => !keep.has(e.userId)).map((e) => e.id);
  if (remove.length) {
    await tx
      .update(scheduleAssignments)
      .set({ deletedAt: new Date() })
      .where(inArray(scheduleAssignments.id, remove));
  }

  const current = new Set(existing.map((e) => e.userId));
  const add = userIds.filter((id) => !current.has(id));
  if (add.length) {
    // Un-delete anyone who was on it before rather than stacking rows.
    await tx
      .update(scheduleAssignments)
      .set({ deletedAt: null })
      .where(and(eq(scheduleAssignments.eventId, eventId), inArray(scheduleAssignments.userId, add)));

    const back = await tx
      .select({ userId: scheduleAssignments.userId })
      .from(scheduleAssignments)
      .where(and(eq(scheduleAssignments.eventId, eventId), isNull(scheduleAssignments.deletedAt)));
    const backSet = new Set(back.map((b) => b.userId));

    const fresh = add.filter((id) => !backSet.has(id));
    if (fresh.length) {
      await tx.insert(scheduleAssignments).values(fresh.map((userId) => ({ eventId, userId })));
    }
  }
}

const MoveSchema = z.object({
  eventId: z.string().uuid(),
  /** New first day. The block keeps its length. */
  startDate: isoDay,
});

/** What a drag-and-drop does: slide the block, keep its length and crew. */
export const moveScheduleEvent = action("schedule.manage", MoveSchema, async (input, user) => {
  const [event] = await db
    .select()
    .from(scheduleEvents)
    .where(eq(scheduleEvents.id, input.eventId))
    .limit(1);
  if (!event) return fail("That booking no longer exists.");

  const lengthMs = event.endAt.getTime() - event.startAt.getTime();
  const startAt = new Date(`${input.startDate}T07:00:00`);
  const endAt = new Date(startAt.getTime() + lengthMs);

  const oldStart = event.startAt.toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    await tx
      .update(scheduleEvents)
      .set({ startAt, endAt, updatedAt: new Date() })
      .where(eq(scheduleEvents.id, input.eventId));

    await recordAudit(tx, {
      entityType: "schedule_event",
      entityId: input.eventId,
      action: "update",
      summary: `Moved "${event.title}" from ${formatDate(oldStart)} to ${formatDate(input.startDate)}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      changes: { startDate: { from: oldStart, to: input.startDate } },
    });
  });

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return ok(undefined, `Moved to ${formatDate(input.startDate)}.`);
});

const RemoveSchema = z.object({ eventId: z.string().uuid() });

export const removeScheduleEvent = action("schedule.manage", RemoveSchema, async (input, user) => {
  const [event] = await db
    .select()
    .from(scheduleEvents)
    .where(eq(scheduleEvents.id, input.eventId))
    .limit(1);
  if (!event) return fail("That booking no longer exists.");

  await db.transaction(async (tx) => {
    await tx
      .update(scheduleEvents)
      .set({ deletedAt: new Date() })
      .where(eq(scheduleEvents.id, input.eventId));
    await recordAudit(tx, {
      entityType: "schedule_event",
      entityId: input.eventId,
      action: "delete",
      summary: `Took "${event.title}" off the calendar`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return ok(undefined, "Taken off the calendar.");
});
