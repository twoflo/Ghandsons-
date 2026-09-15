import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { dirname, join, extname } from "node:path";

export type StoredObject = {
  storageKey: string;
  storageDriver: string;
  sizeBytes: number;
  checksumSha256: string;
};

export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** A URL the browser can load directly, or null if it must stream via our route. */
  publicUrl(key: string): string | null;
}

/* ------------------------------ local driver ------------------------------ */

class LocalDriver implements StorageDriver {
  readonly name = "local";
  private root = process.env.STORAGE_LOCAL_DIR ?? "./public/uploads";

  private path(key: string) {
    // Guard against traversal in a key that came from anywhere but us.
    if (key.includes("..")) throw new Error("Invalid storage key");
    return join(process.cwd(), this.root, key);
  }

  async put(key: string, body: Buffer) {
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async get(key: string) {
    return readFile(this.path(key));
  }

  publicUrl() {
    // Served through /api/files/[id] so soft-deleted files stop resolving and
    // access follows the signed-in user, not the URL.
    return null;
  }

  async exists(key: string) {
    try {
      await stat(this.path(key));
      return true;
    } catch {
      return false;
    }
  }
}

/* ----------------------------- supabase driver ---------------------------- */

class SupabaseDriver implements StorageDriver {
  readonly name = "supabase";
  private url = process.env.SUPABASE_URL ?? "";
  private key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  private bucket = process.env.SUPABASE_BUCKET ?? "ghandsons";

  private assertConfigured() {
    if (!this.url || !this.key) {
      throw new Error(
        "Supabase storage is selected but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.",
      );
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    this.assertConfigured();
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
  }

  async get(key: string) {
    this.assertConfigured();
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${key}`, {
      headers: { Authorization: `Bearer ${this.key}` },
    });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  publicUrl() {
    return null;
  }
}

let cached: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (cached) return cached;
  cached = process.env.STORAGE_DRIVER === "supabase" ? new SupabaseDriver() : new LocalDriver();
  return cached;
}

/* -------------------------------- helpers -------------------------------- */

const SAFE_NAME = /[^a-zA-Z0-9._-]+/g;

/**
 * Keys are `<prefix>/<yyyy>/<mm>/<uuid><ext>` so the bucket stays browsable
 * and a filename from a phone can never escape its folder.
 */
export function buildStorageKey(prefix: string, filename: string): string {
  const now = new Date();
  const ext = extname(filename).slice(0, 10).replace(SAFE_NAME, "") || "";
  return `${prefix}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${randomUUID()}${ext}`;
}

export function sanitiseFilename(filename: string): string {
  const cleaned = filename.replace(SAFE_NAME, "_").slice(0, 200);
  return cleaned || "upload";
}

export async function putObject(
  prefix: string,
  filename: string,
  body: Buffer,
  contentType: string,
): Promise<StoredObject> {
  const driver = storage();
  const storageKey = buildStorageKey(prefix, filename);
  await driver.put(storageKey, body, contentType);
  return {
    storageKey,
    storageDriver: driver.name,
    sizeBytes: body.byteLength,
    checksumSha256: createHash("sha256").update(body).digest("hex"),
  };
}
