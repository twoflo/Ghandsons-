"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fileLinks, jobPhotos } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit } from "@/lib/audit";
import { fail, ok } from "@/lib/result";

const RemoveDocSchema = z.object({ linkId: z.string().uuid() });

/**
 * Removing a document unlinks it. The bytes stay in storage and the `files`
 * row stays too — nothing in this app destroys an upload, because the one
 * you delete is always the one the certifier asks for.
 */
export const removeDocument = action("documents.delete", RemoveDocSchema, async (input, user) => {
  const [link] = await db.select().from(fileLinks).where(eq(fileLinks.id, input.linkId)).limit(1);
  if (!link) return fail("That document is already gone.");

  await db.transaction(async (tx) => {
    await tx.update(fileLinks).set({ deletedAt: new Date() }).where(eq(fileLinks.id, input.linkId));
    await recordAudit(tx, {
      entityType: link.entityType,
      entityId: link.entityId,
      action: "delete",
      summary: `Removed the document "${link.title ?? "untitled"}"`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath(`/jobs/${link.entityId}/documents`);
  return ok(undefined, "Removed from the list. The file itself is kept.");
});

const PhotoSchema = z.object({
  photoId: z.string().uuid(),
  caption: z.string().trim().max(500).optional(),
  category: z.enum(["progress", "before", "after", "defect", "compliance", "other"]).optional(),
});

export const updatePhoto = action("documents.manage", PhotoSchema, async (input, user) => {
  const [photo] = await db.select().from(jobPhotos).where(eq(jobPhotos.id, input.photoId)).limit(1);
  if (!photo) return fail("That photo is no longer there.");

  await db
    .update(jobPhotos)
    .set({
      caption: input.caption ?? photo.caption,
      category: input.category ?? photo.category,
      updatedAt: new Date(),
    })
    .where(eq(jobPhotos.id, input.photoId));

  void user;
  revalidatePath(`/jobs/${photo.jobId}/photos`);
  return ok(undefined, "Saved.");
});

const RemovePhotoSchema = z.object({ photoId: z.string().uuid() });

export const removePhoto = action("documents.delete", RemovePhotoSchema, async (input, user) => {
  const [photo] = await db.select().from(jobPhotos).where(eq(jobPhotos.id, input.photoId)).limit(1);
  if (!photo) return fail("That photo is no longer there.");

  await db.transaction(async (tx) => {
    await tx.update(jobPhotos).set({ deletedAt: new Date() }).where(eq(jobPhotos.id, input.photoId));
    await recordAudit(tx, {
      entityType: "job",
      entityId: photo.jobId,
      action: "delete",
      summary: `Removed a site photo${photo.caption ? ` — ${photo.caption}` : ""}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath(`/jobs/${photo.jobId}/photos`);
  return ok(undefined, "Taken off the gallery. The photo itself is kept.");
});
