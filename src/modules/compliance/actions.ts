"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { complianceItems, safetyDocs, safetySignoffs, incidents } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { nextNumber } from "@/lib/numbering";
import { formatDate, today } from "@/lib/dates";
import { fail, ok } from "@/lib/result";
import { moneyField, dateField } from "@/modules/jobs/validation";

const ComplianceSchema = z.object({
  id: z.string().uuid().optional(),
  subjectType: z.enum(["business", "worker", "subcontractor", "supplier"]),
  subjectId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
  subjectLabel: z.string().trim().min(2, "Whose is it?"),
  kind: z.enum(["licence", "insurance", "certification", "registration", "induction"]),
  name: z.string().trim().min(2, "What's it called?"),
  identifier: z.string().trim().max(100).optional(),
  issuer: z.string().trim().max(200).optional(),
  issueDate: dateField,
  expiryDate: dateField,
  coverageCents: moneyField.optional(),
  fileId: z.string().uuid().nullable().optional(),
  remindDaysBefore: z.coerce.number().int().min(0).max(365).default(30),
  isRequired: z.coerce.boolean().default(true),
  notes: z.string().trim().max(2000).optional(),
});

export const saveComplianceItem = action("compliance.manage", ComplianceSchema, async (input, user) => {
  const id = await db.transaction(async (tx) => {
    const values = {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      subjectLabel: input.subjectLabel,
      kind: input.kind,
      name: input.name,
      identifier: input.identifier ?? null,
      issuer: input.issuer ?? null,
      issueDate: input.issueDate,
      expiryDate: input.expiryDate,
      coverageCents: input.coverageCents || null,
      fileId: input.fileId ?? null,
      remindDaysBefore: input.remindDaysBefore,
      isRequired: input.isRequired,
      notes: input.notes ?? null,
      updatedAt: new Date(),
    };

    if (input.id) {
      await tx.update(complianceItems).set(values).where(eq(complianceItems.id, input.id));
      await recordAudit(tx, {
        entityType: "compliance_item",
        entityId: input.id,
        action: "update",
        summary: `Updated ${input.name} for ${input.subjectLabel}${
          input.expiryDate ? ` — expires ${formatDate(input.expiryDate)}` : ""
        }`,
        actorUserId: user.id,
        actorLabel: user.fullName,
      });
      return input.id;
    }

    const [created] = await tx
      .insert(complianceItems)
      .values(values)
      .returning({ id: complianceItems.id });

    await recordAudit(tx, {
      entityType: "compliance_item",
      entityId: created!.id,
      action: "create",
      summary: `Recorded ${input.name} for ${input.subjectLabel}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
    return created!.id;
  });

  revalidatePath("/compliance");
  revalidatePath("/dashboard");
  return ok({ id }, "Saved. You'll get a warning before it expires.");
});

const RemoveSchema = z.object({ itemId: z.string().uuid() });

export const archiveComplianceItem = action("compliance.manage", RemoveSchema, async (input, user) => {
  const [item] = await db
    .select()
    .from(complianceItems)
    .where(eq(complianceItems.id, input.itemId))
    .limit(1);
  if (!item) return fail("That record is already gone.");

  await db.transaction(async (tx) => {
    await tx
      .update(complianceItems)
      .set({ deletedAt: new Date() })
      .where(eq(complianceItems.id, input.itemId));
    await recordAudit(tx, {
      entityType: "compliance_item",
      entityId: input.itemId,
      action: "delete",
      summary: `Archived ${item.name} for ${item.subjectLabel}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/compliance");
  return ok(undefined, "Archived.");
});

/* -------------------------------- safety --------------------------------- */

const SafetyDocSchema = z.object({
  id: z.string().uuid().optional(),
  jobId: z.string().uuid(),
  kind: z.enum(["swms", "jsa", "risk_assessment", "permit", "toolbox_talk"]),
  title: z.string().trim().min(3, "Give it a title."),
  version: z.string().trim().max(20).default("1"),
  fileId: z.string().uuid().nullable().optional(),
  validFrom: dateField,
  validTo: dateField,
  highRiskActivities: z.array(z.string().trim().max(120)).default([]),
});

export const saveSafetyDoc = action("compliance.manage", SafetyDocSchema, async (input, user) => {
  const id = await db.transaction(async (tx) => {
    const values = {
      jobId: input.jobId,
      kind: input.kind,
      title: input.title,
      version: input.version,
      fileId: input.fileId ?? null,
      validFrom: input.validFrom,
      validTo: input.validTo,
      highRiskActivities: input.highRiskActivities,
      updatedAt: new Date(),
    };

    if (input.id) {
      await tx.update(safetyDocs).set(values).where(eq(safetyDocs.id, input.id));
      return input.id;
    }

    const [created] = await tx
      .insert(safetyDocs)
      .values({ ...values, createdBy: user.id })
      .returning({ id: safetyDocs.id });

    await recordAudit(tx, {
      entityType: "job",
      entityId: input.jobId,
      action: "create",
      summary: `Added ${input.kind.toUpperCase()} "${input.title}"`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
    return created!.id;
  });

  revalidatePath(`/jobs/${input.jobId}/safety`);
  revalidatePath("/compliance");
  return ok({ id }, "Saved.");
});

const SignoffSchema = z.object({
  safetyDocId: z.string().uuid(),
  signedName: z.string().trim().min(2, "Put your name on it."),
});

/**
 * Signing a SWMS. The name is typed rather than picked from a list because
 * subcontractors and visitors sign these too, and they don't have logins.
 */
export const signSafetyDoc = action("compliance.view", SignoffSchema, async (input, user) => {
  const [doc] = await db.select().from(safetyDocs).where(eq(safetyDocs.id, input.safetyDocId)).limit(1);
  if (!doc) return fail("That document is no longer there.");

  await db.transaction(async (tx) => {
    await tx.insert(safetySignoffs).values({
      safetyDocId: input.safetyDocId,
      userId: user.id,
      signedName: input.signedName,
    });
    await recordAudit(tx, {
      entityType: "job",
      entityId: doc.jobId,
      action: "approve",
      summary: `${input.signedName} signed "${doc.title}"`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath(`/jobs/${doc.jobId}/safety`);
  return ok(undefined, "Signed. Thanks.");
});

/* ------------------------------- incidents ------------------------------- */

const IncidentSchema = z.object({
  id: z.string().uuid().optional(),
  jobId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
  occurredAt: z.string().min(1, "When did it happen?"),
  severity: z.enum(["near_miss", "first_aid", "minor", "serious", "notifiable"]),
  personInvolved: z.string().trim().max(200).optional(),
  description: z.string().trim().min(10, "Write down what actually happened, in a few sentences."),
  immediateAction: z.string().trim().max(2000).optional(),
  correctiveAction: z.string().trim().max(2000).optional(),
  reportedToAuthority: z.coerce.boolean().default(false),
  authorityReference: z.string().trim().max(100).optional(),
  status: z.enum(["open", "investigating", "closed"]).default("open"),
});

/**
 * The incident log. Legally you keep these for years, so nothing here is
 * ever deleted and the notifiable ones are flagged hard — in Queensland a
 * notifiable incident has to reach the regulator immediately.
 */
export const saveIncident = action("incidents.create", IncidentSchema, async (input, user) => {
  const id = await db.transaction(async (tx) => {
    const values = {
      jobId: input.jobId,
      occurredAt: new Date(input.occurredAt),
      severity: input.severity,
      personInvolved: input.personInvolved ?? null,
      description: input.description,
      immediateAction: input.immediateAction ?? null,
      correctiveAction: input.correctiveAction ?? null,
      reportedToAuthority: input.reportedToAuthority,
      authorityReference: input.authorityReference ?? null,
      status: input.status,
      closedAt: input.status === "closed" ? new Date() : null,
      updatedAt: new Date(),
    };

    if (input.id) {
      await tx.update(incidents).set(values).where(eq(incidents.id, input.id));
      await recordAudit(tx, {
        entityType: "incident",
        entityId: input.id,
        action: "update",
        summary: `Updated an incident record (${input.severity.replace("_", " ")})`,
        actorUserId: user.id,
        actorLabel: user.fullName,
      });
      return input.id;
    }

    const incidentNumber = await nextNumber(tx, "incident");
    const [created] = await tx
      .insert(incidents)
      .values({ ...values, incidentNumber, reportedBy: user.id })
      .returning({ id: incidents.id });

    await recordAudit(tx, {
      entityType: "incident",
      entityId: created!.id,
      action: "create",
      summary: `Logged incident ${incidentNumber} — ${input.severity.replace("_", " ")} on ${formatDate(today())}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
    return created!.id;
  });

  revalidatePath("/compliance");
  if (input.jobId) revalidatePath(`/jobs/${input.jobId}/safety`);
  return ok(
    { id },
    input.severity === "notifiable"
      ? "Logged. A notifiable incident has to be reported to the regulator straight away — don't wait."
      : "Logged.",
  );
});
