import { eq } from "drizzle-orm";
import { db } from "@/db";
import { receiptUploads, files } from "@/db/schema";
import { storage } from "@/lib/storage";
import { runOcr } from "./ocr";
import { extractReceipt } from "./extract";
import { suggestForReceipt } from "./suggest";
import { recordAudit } from "@/lib/audit";

/**
 * Takes one uploaded image from `uploaded` to `needs_review`.
 *
 *   image -> OCR (optional) -> model extraction -> arithmetic checks
 *         -> supplier / category / job suggestions -> saved for review
 *
 * Every failure mode ends with the row in a state a human can act on. An
 * upload must never disappear: the photo is often the only copy of the
 * docket, and the person who took it has already driven away.
 */
export async function processReceiptUpload(uploadId: string): Promise<void> {
  const [upload] = await db
    .select()
    .from(receiptUploads)
    .where(eq(receiptUploads.id, uploadId))
    .limit(1);

  if (!upload) return;
  if (upload.status === "approved" || upload.status === "discarded") return;

  await db
    .update(receiptUploads)
    .set({ status: "processing", attempts: upload.attempts + 1, updatedAt: new Date() })
    .where(eq(receiptUploads.id, uploadId));

  try {
    const [file] = await db.select().from(files).where(eq(files.id, upload.fileId)).limit(1);
    if (!file) throw new Error("The uploaded image has gone missing.");

    const bytes = await storage().get(file.storageKey);

    const ocr = await runOcr(bytes, file.mimeType);

    const outcome = await extractReceipt({
      imageBase64: bytes.toString("base64"),
      mimeType: file.mimeType,
      ocrText: ocr.text,
      filename: file.filename,
    });

    const suggestions = await suggestForReceipt(outcome.extraction, {
      uploadedBy: upload.uploadedBy,
      jobHint: upload.suggestedJobId,
    });

    const notes = [outcome.extraction.notes, ...outcome.warnings].filter(Boolean).join(" ");

    await db
      .update(receiptUploads)
      .set({
        status: "needs_review",
        ocrProvider: ocr.provider,
        ocrText: ocr.text,
        ocrMs: ocr.elapsedMs,
        extractionProvider: outcome.provider,
        extractionModel: outcome.model,
        extractionMs: outcome.elapsedMs,
        extraction: { ...outcome.extraction, notes: notes || null },
        overallConfidence: outcome.overallConfidence,
        arithmeticOk: outcome.arithmeticOk,
        suggestedSupplierId: suggestions.supplierId,
        suggestedCategoryId: suggestions.categoryId,
        suggestedJobId: suggestions.jobId,
        suggestionReason: suggestions.reason || null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(receiptUploads.id, uploadId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[receipts] extraction failed", uploadId, error);

    await db
      .update(receiptUploads)
      .set({
        status: "failed",
        errorMessage: friendlyFailure(message),
        updatedAt: new Date(),
      })
      .where(eq(receiptUploads.id, uploadId));

    await recordAudit(db, {
      entityType: "receipt_upload",
      entityId: uploadId,
      action: "update",
      summary: `Couldn't read a receipt: ${message}`,
      actorLabel: "System",
    });
  }
}

/** Never show the owner a stack trace. Tell him what to do instead. */
function friendlyFailure(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("rate") && lower.includes("limit")) {
    return "Too many receipts at once. It'll be read shortly — or press Read it again.";
  }
  if (lower.includes("api key") || lower.includes("authentication")) {
    return "Receipt reading isn't switched on yet. The fields are blank — fill them in by hand, or ask whoever set this up to add the key.";
  }
  if (lower.includes("declined") || lower.includes("refusal")) {
    return "That image couldn't be read. Take it again, flat and in good light.";
  }
  if (lower.includes("missing")) {
    return "The photo didn't upload properly. Take it again.";
  }
  return "Couldn't read that one. Take it again in better light, flat on the tailgate — or type it in by hand.";
}

/** Runs a batch one at a time so a bulk upload can't hammer the API. */
export async function processQueue(uploadIds: string[]): Promise<void> {
  for (const id of uploadIds) {
    await processReceiptUpload(id);
  }
}
