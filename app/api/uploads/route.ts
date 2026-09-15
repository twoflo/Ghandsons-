import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { files, fileLinks, jobPhotos } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { putObject, sanitiseFilename } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPTED = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif",
  "image/svg+xml", "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
]);

/**
 * General-purpose upload: job documents, site photos, compliance
 * certificates, signed variations.
 *
 * `target` says what it attaches to:
 *   photo:<jobId>      a site photo, with a caption and a category
 *   job:<jobId>        a document on a job
 *   client:<clientId>  a document on a client
 *   compliance:<id>    a certificate against a licence or insurance record
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(user.role, "documents.manage")) {
    return NextResponse.json({ error: "You can't upload documents." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "The upload didn't come through." }, { status: 400 });
  }

  const target = String(form.get("target") ?? "");
  const [kindPrefix, entityId] = target.split(":");
  if (!kindPrefix || !entityId) {
    return NextResponse.json({ error: "We don't know where to put that." }, { status: 400 });
  }

  const incoming = form.getAll("files").filter((f): f is File => f instanceof File);
  if (incoming.length === 0) {
    return NextResponse.json({ error: "No file came through." }, { status: 400 });
  }

  const documentKind = String(form.get("kind") ?? "document");
  const title = (form.get("title") as string | null)?.trim() || null;
  const notes = (form.get("notes") as string | null)?.trim() || null;
  const caption = (form.get("caption") as string | null)?.trim() || null;
  const category = String(form.get("category") ?? "progress");

  const saved: string[] = [];
  const rejected: Array<{ filename: string; reason: string }> = [];

  for (const incomingFile of incoming) {
    if (!ACCEPTED.has(incomingFile.type)) {
      rejected.push({
        filename: incomingFile.name,
        reason: `We can't store ${incomingFile.type || "that kind of file"}.`,
      });
      continue;
    }
    if (incomingFile.size > MAX_BYTES) {
      rejected.push({ filename: incomingFile.name, reason: "That file is over 25MB." });
      continue;
    }

    const bytes = Buffer.from(await incomingFile.arrayBuffer());
    const filename = sanitiseFilename(incomingFile.name || "upload");
    const stored = await putObject(kindPrefix === "photo" ? "photos" : "documents", filename, bytes, incomingFile.type);

    const [fileRow] = await db
      .insert(files)
      .values({
        storageKey: stored.storageKey,
        storageDriver: stored.storageDriver,
        filename,
        mimeType: incomingFile.type,
        sizeBytes: stored.sizeBytes,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
        uploadedBy: user.id,
      })
      .returning({ id: files.id });

    if (kindPrefix === "photo") {
      await db.insert(jobPhotos).values({
        jobId: entityId,
        fileId: fileRow!.id,
        caption: caption ?? title,
        category,
        uploadedBy: user.id,
      });
    } else {
      await db.insert(fileLinks).values({
        fileId: fileRow!.id,
        entityType: kindPrefix,
        entityId,
        kind: documentKind,
        title: title ?? filename,
        notes,
        uploadedBy: user.id,
      });
    }

    saved.push(fileRow!.id);
  }

  if (saved.length > 0) {
    await audit({
      entityType: kindPrefix === "photo" ? "job" : kindPrefix,
      entityId,
      action: "create",
      summary: `${user.fullName} added ${saved.length} ${kindPrefix === "photo" ? "photo" : "document"}${saved.length === 1 ? "" : "s"}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  }

  return NextResponse.json({
    saved,
    rejected,
    message:
      saved.length === 0
        ? "Nothing was saved."
        : `${saved.length} ${kindPrefix === "photo" ? "photo" : "file"}${saved.length === 1 ? "" : "s"} saved.`,
  });
}
