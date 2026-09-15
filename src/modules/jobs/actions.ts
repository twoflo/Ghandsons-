"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { jobs, jobStatusHistory, jobNotes, jobAssignments } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit, diffFields } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { formatMoney } from "@/lib/money";
import { fail, ok } from "@/lib/result";
import { JOB_STATUS, type JobStatus } from "@/lib/status";
import { JobSchema, JobStatusSchema, JobNoteSchema, JobCrewSchema } from "./validation";

export const saveJob = action("jobs.manage", JobSchema, async (input, user) => {
  const budgetFields = {
    budgetLabourCents: input.budgetLabourCents,
    budgetMaterialCents: input.budgetMaterialCents,
    budgetSubcontractorCents: input.budgetSubcontractorCents,
    budgetPlantCents: input.budgetPlantCents,
    budgetOtherCents: input.budgetOtherCents,
  };

  const jobId = await db.transaction(async (tx) => {
    if (input.id) {
      const [before] = await tx.select().from(jobs).where(eq(jobs.id, input.id)).limit(1);
      if (!before) throw new Error("That job no longer exists.");

      const patch = {
        title: input.title,
        clientId: input.clientId,
        siteId: input.siteId,
        jobTypeId: input.jobTypeId,
        description: input.description ?? null,
        notes: input.notes ?? null,
        leadSource: input.leadSource ?? null,
        lostReason: input.lostReason ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        isPriority: input.isPriority,
        contractValueCents: input.contractValueCents,
        ...budgetFields,
        updatedAt: new Date(),
      };

      await tx.update(jobs).set(patch).where(eq(jobs.id, input.id));

      const changes = diffFields(before as never, patch as never, [
        "title", "clientId", "siteId", "jobTypeId", "startDate", "endDate",
        "contractValueCents", "budgetLabourCents", "budgetMaterialCents",
        "budgetSubcontractorCents", "budgetPlantCents", "budgetOtherCents",
      ]);

      await recordAudit(tx, {
        entityType: "job",
        entityId: input.id,
        action: "update",
        summary: `Updated ${before.jobNumber} — ${input.title}`,
        actorUserId: user.id,
        actorLabel: user.fullName,
        changes,
      });

      return input.id;
    }

    const jobNumber = await nextNumber(tx, "job");
    const [created] = await tx
      .insert(jobs)
      .values({
        jobNumber,
        title: input.title,
        clientId: input.clientId,
        siteId: input.siteId,
        jobTypeId: input.jobTypeId,
        status: input.status,
        description: input.description ?? null,
        notes: input.notes ?? null,
        leadSource: input.leadSource ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        isPriority: input.isPriority,
        contractValueCents: input.contractValueCents,
        ...budgetFields,
        createdBy: user.id,
      })
      .returning({ id: jobs.id });

    await tx.insert(jobStatusHistory).values({
      jobId: created!.id,
      fromStatus: null,
      toStatus: input.status,
      note: "Job created",
      changedBy: user.id,
    });

    await recordAudit(tx, {
      entityType: "job",
      entityId: created!.id,
      action: "create",
      summary: `Created ${jobNumber} — ${input.title}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      amountCents: input.contractValueCents || null,
    });

    return created!.id;
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
  return ok({ id: jobId }, input.id ? "Job saved." : "Job created.");
});

export const changeJobStatus = action("jobs.manage", JobStatusSchema, async (input, user) => {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
  if (!job) return fail("That job no longer exists.");
  if (job.status === input.status) return ok(undefined, "Already at that status.");

  await db.transaction(async (tx) => {
    const patch: Record<string, unknown> = { status: input.status, updatedAt: new Date() };

    // Keep the real dates honest as the job moves through the pipeline.
    if (input.status === "in_progress" && !job.actualStartDate) {
      patch.actualStartDate = new Date().toISOString().slice(0, 10);
    }
    if (input.status === "complete" && !job.actualEndDate) {
      patch.actualEndDate = new Date().toISOString().slice(0, 10);
    }

    await tx.update(jobs).set(patch).where(eq(jobs.id, input.jobId));

    await tx.insert(jobStatusHistory).values({
      jobId: input.jobId,
      fromStatus: job.status,
      toStatus: input.status,
      note: input.note ?? null,
      changedBy: user.id,
    });

    await recordAudit(tx, {
      entityType: "job",
      entityId: input.jobId,
      action: "status_change",
      summary: `${job.jobNumber} moved from ${JOB_STATUS[job.status as JobStatus].label} to ${JOB_STATUS[input.status].label}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
      changes: { status: { from: job.status, to: input.status } },
    });
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath("/dashboard");
  return ok(undefined, `Moved to ${JOB_STATUS[input.status].label}.`);
});

export const addJobNote = action("jobs.view", JobNoteSchema, async (input, user) => {
  await db.insert(jobNotes).values({
    jobId: input.jobId,
    body: input.body,
    pinned: input.pinned,
    createdBy: user.id,
  });
  revalidatePath(`/jobs/${input.jobId}`);
  return ok(undefined, "Note added.");
});

export const setJobCrew = action("jobs.manage", JobCrewSchema, async (input, user) => {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: jobAssignments.id, userId: jobAssignments.userId })
      .from(jobAssignments)
      .where(and(eq(jobAssignments.jobId, input.jobId), isNull(jobAssignments.deletedAt)));

    const keep = new Set(input.userIds);
    const current = new Set(existing.map((e) => e.userId));

    const toRemove = existing.filter((e) => !keep.has(e.userId)).map((e) => e.id);
    if (toRemove.length) {
      await tx
        .update(jobAssignments)
        .set({ deletedAt: new Date() })
        .where(inArray(jobAssignments.id, toRemove));
    }

    const toAdd = input.userIds.filter((id) => !current.has(id));
    if (toAdd.length) {
      // Bring back anyone previously removed rather than stacking duplicates.
      await tx
        .update(jobAssignments)
        .set({ deletedAt: null })
        .where(and(eq(jobAssignments.jobId, input.jobId), inArray(jobAssignments.userId, toAdd)));

      const restored = await tx
        .select({ userId: jobAssignments.userId })
        .from(jobAssignments)
        .where(and(eq(jobAssignments.jobId, input.jobId), isNull(jobAssignments.deletedAt)));
      const restoredSet = new Set(restored.map((r) => r.userId));

      const brandNew = toAdd.filter((id) => !restoredSet.has(id));
      if (brandNew.length) {
        await tx.insert(jobAssignments).values(
          brandNew.map((userId) => ({ jobId: input.jobId, userId, roleOnJob: "crew" })),
        );
      }
    }

    await recordAudit(tx, {
      entityType: "job",
      entityId: input.jobId,
      action: "update",
      summary: `Changed the crew on this job (${input.userIds.length} assigned)`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath("/schedule");
  return ok(undefined, "Crew updated.");
});

const DeleteSchema = JobStatusSchema.pick({ jobId: true });

/**
 * Soft delete only. The row stays, its money stays in the reports history,
 * and an owner can bring it back. Nothing in this app destroys data.
 */
export const archiveJob = action("jobs.delete", DeleteSchema, async (input, user) => {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
  if (!job) return fail("That job no longer exists.");
  if (job.deletedAt) return ok(undefined, "Already archived.");

  await db.transaction(async (tx) => {
    await tx.update(jobs).set({ deletedAt: new Date() }).where(eq(jobs.id, input.jobId));
    await recordAudit(tx, {
      entityType: "job",
      entityId: input.jobId,
      action: "delete",
      summary: `Archived ${job.jobNumber} — ${job.title}${
        job.contractValueCents ? ` (${formatMoney(job.contractValueCents)})` : ""
      }`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/jobs");
  return ok(undefined, "Job archived. It's hidden from lists but nothing has been deleted.");
});

export const restoreJob = action("jobs.delete", DeleteSchema, async (input, user) => {
  await db.transaction(async (tx) => {
    await tx.update(jobs).set({ deletedAt: null }).where(eq(jobs.id, input.jobId));
    await recordAudit(tx, {
      entityType: "job",
      entityId: input.jobId,
      action: "restore",
      summary: "Restored an archived job",
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });
  revalidatePath("/jobs");
  return ok(undefined, "Job restored.");
});
