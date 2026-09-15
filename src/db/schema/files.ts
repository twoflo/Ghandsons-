import { pgTable, text, uuid, integer, index, timestamp, jsonb } from "drizzle-orm/pg-core";
import { pk, timestamps } from "./_shared";
import { users } from "./auth";

/**
 * Every uploaded byte lands here exactly once. Receipts, plans, permits,
 * signed variations, site photos, generated PDFs and the business logo all
 * point at a row in this table.
 *
 * Files are NEVER hard-deleted — `deletedAt` hides them from listings but the
 * object stays in storage. Receipt images in particular must be retained for
 * the ATO's five-year record-keeping requirement.
 */
export const files = pgTable(
  "files",
  {
    id: pk(),
    /** Path within the storage driver's namespace. */
    storageKey: text("storage_key").notNull(),
    storageDriver: text("storage_driver").notNull().default("local"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    checksumSha256: text("checksum_sha256"),
    width: integer("width"),
    height: integer("height"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("files_checksum_idx").on(t.checksumSha256)],
);

/**
 * Polymorphic attachment map. `entityType` is the logical table name,
 * e.g. 'job' | 'client' | 'expense' | 'variation' | 'compliance_item'.
 */
export const fileLinks = pgTable(
  "file_links",
  {
    id: pk(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    /** 'plan' | 'permit' | 'variation' | 'signed' | 'receipt' | 'docket' | 'swms' | 'photo' | 'pdf' */
    kind: text("kind").notNull().default("document"),
    title: text("title"),
    notes: text("notes"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("file_links_entity_idx").on(t.entityType, t.entityId),
    index("file_links_file_idx").on(t.fileId),
  ],
);
