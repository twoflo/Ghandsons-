import { NextResponse } from "next/server";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { files, receiptUploads, receiptBatches } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { putObject, sanitiseFilename } from "@/lib/storage";
import { processQueue } from "@/lib/receipts/pipeline";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_FILES = 25;
const ACCEPTED = new Set([
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "image/gif", "image/svg+xml", "application/pdf",
]);

/**
 * Receives one or more photographed receipts.
 *
 * The response comes back as soon as the bytes are safely stored — the phone
 * can be locked and put in a pocket at that point. Reading them happens after
 * the response, so a bulk drop of fifteen dockets doesn't hold the connection
 * open on a bar and a half of 4G.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(user.role, "receipts.upload")) {
    return NextResponse.json({ error: "You can't upload receipts." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "The upload didn't come through. Check your signal and try again." },
      { status: 400 },
    );
  }

  const incoming = form.getAll("files").filter((f): f is File => f instanceof File);
  const jobId = (form.get("jobId") as string | null) || null;
  const batchLabel = (form.get("batchLabel") as string | null) || null;

  if (incoming.length === 0) {
    return NextResponse.json({ error: "No photo came through. Try again." }, { status: 400 });
  }
  if (incoming.length > MAX_FILES) {
    return NextResponse.json(
      { error: `That's ${incoming.length} at once — do them in lots of ${MAX_FILES} or fewer.` },
      { status: 400 },
    );
  }

  let batchId: string | null = null;
  if (incoming.length > 1) {
    const [batch] = await db
      .insert(receiptBatches)
      .values({ label: batchLabel ?? `${incoming.length} receipts`, createdBy: user.id })
      .returning({ id: receiptBatches.id });
    batchId = batch!.id;
  }

  const created: Array<{ id: string; filename: string }> = [];
  const rejected: Array<{ filename: string; reason: string }> = [];

  for (const incomingFile of incoming) {
    if (!ACCEPTED.has(incomingFile.type)) {
      rejected.push({
        filename: incomingFile.name,
        reason: `We can't read ${incomingFile.type || "that kind of file"}. A photo or a PDF works.`,
      });
      continue;
    }
    if (incomingFile.size > MAX_BYTES) {
      rejected.push({
        filename: incomingFile.name,
        reason: "That photo is too big. Your phone's camera app can shrink it, or take it again.",
      });
      continue;
    }
    if (incomingFile.size === 0) {
      rejected.push({ filename: incomingFile.name, reason: "That file came through empty." });
      continue;
    }

    const bytes = Buffer.from(await incomingFile.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");

    // The same docket photographed twice shouldn't queue twice.
    const existing = await db.query.files.findFirst({
      where: (f, { eq, and, isNull }) => and(eq(f.checksumSha256, checksum), isNull(f.deletedAt)),
    });

    if (existing) {
      const already = await db.query.receiptUploads.findFirst({
        where: (r, { eq, and, isNull }) => and(eq(r.fileId, existing.id), isNull(r.deletedAt)),
      });
      if (already) {
        rejected.push({
          filename: incomingFile.name,
          reason: "You've already uploaded that one — it's in the queue.",
        });
        continue;
      }
    }

    const filename = sanitiseFilename(incomingFile.name || "receipt.jpg");
    const stored = await putObject("receipts", filename, bytes, incomingFile.type);

    const [fileRow] = await db
      .insert(files)
      .values({
        storageKey: stored.storageKey,
        storageDriver: stored.storageDriver,
        filename,
        mimeType: incomingFile.type,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        uploadedBy: user.id,
      })
      .returning({ id: files.id });

    const [uploadRow] = await db
      .insert(receiptUploads)
      .values({
        batchId,
        fileId: fileRow!.id,
        status: "uploaded",
        suggestedJobId: jobId,
        uploadedBy: user.id,
      })
      .returning({ id: receiptUploads.id });

    created.push({ id: uploadRow!.id, filename });
  }

  if (created.length > 0) {
    await audit({
      entityType: "receipt_upload",
      entityId: created[0]!.id,
      action: "create",
      summary: `${user.fullName} uploaded ${created.length} receipt${created.length === 1 ? "" : "s"}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });

    // Read them after the response has gone back to the phone.
    after(async () => {
      await processQueue(created.map((c) => c.id));
    });
  }

  return NextResponse.json({
    uploaded: created,
    rejected,
    batchId,
    message:
      created.length === 0
        ? "Nothing was uploaded."
        : `${created.length} receipt${created.length === 1 ? "" : "s"} uploaded. We're reading ${created.length === 1 ? "it" : "them"} now.`,
  });
}
