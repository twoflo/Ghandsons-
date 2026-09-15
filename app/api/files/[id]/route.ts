import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { storage } from "@/lib/storage";

/**
 * All uploaded bytes are served through here rather than as public URLs, so
 * access follows the signed-in user and a soft-deleted file stops resolving
 * without anything being removed from storage.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), isNull(files.deletedAt)))
    .limit(1);

  if (!file) return new NextResponse("Not found", { status: 404 });

  try {
    const body = await storage().get(file.storageKey);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
        // Immutable: a file's bytes never change once stored.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("That file could not be opened.", { status: 404 });
  }
}
