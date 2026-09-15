import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type DocumentRow = {
  id: string;
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  title: string | null;
  notes: string | null;
  uploadedByName: string | null;
  createdAt: string;
};

export const DOCUMENT_KINDS = [
  { value: "plan", label: "Plans & drawings", icon: "📐" },
  { value: "permit", label: "Permits & approvals", icon: "📋" },
  { value: "signed", label: "Signed documents", icon: "✍️" },
  { value: "variation", label: "Variation paperwork", icon: "🔧" },
  { value: "compliance", label: "Certificates", icon: "🛡️" },
  { value: "docket", label: "Delivery dockets", icon: "🚚" },
  { value: "document", label: "Everything else", icon: "📄" },
] as const;

export async function listDocuments(entityType: string, entityId: string): Promise<DocumentRow[]> {
  return rows<DocumentRow>(sql`
    SELECT fl.id, fl.file_id AS "fileId", f.filename, f.mime_type AS "mimeType",
           f.size_bytes AS "sizeBytes", fl.kind, fl.title, fl.notes,
           u.full_name AS "uploadedByName", fl.created_at::text AS "createdAt"
    FROM file_links fl
    JOIN files f ON f.id = fl.file_id
    LEFT JOIN users u ON u.id = fl.uploaded_by
    WHERE fl.entity_type = ${entityType} AND fl.entity_id = ${entityId}
      AND fl.deleted_at IS NULL AND f.deleted_at IS NULL
      AND fl.kind <> 'photo'
    ORDER BY fl.created_at DESC
  `);
}

export type PhotoRow = {
  id: string;
  fileId: string;
  caption: string | null;
  category: string;
  takenAt: string;
  uploadedByName: string | null;
  filename: string;
};

export const PHOTO_CATEGORIES = [
  { value: "progress", label: "Progress" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "defect", label: "Defect" },
  { value: "compliance", label: "Safety & compliance" },
  { value: "other", label: "Other" },
] as const;

export async function listPhotos(jobId: string, category?: string): Promise<PhotoRow[]> {
  return rows<PhotoRow>(sql`
    SELECT p.id, p.file_id AS "fileId", p.caption, p.category,
           p.taken_at::text AS "takenAt", u.full_name AS "uploadedByName", f.filename
    FROM job_photos p
    JOIN files f ON f.id = p.file_id
    LEFT JOIN users u ON u.id = p.uploaded_by
    WHERE p.job_id = ${jobId} AND p.deleted_at IS NULL AND f.deleted_at IS NULL
      ${category ? sql`AND p.category = ${category}` : sql``}
    ORDER BY p.taken_at DESC, p.sort_order
  `);
}

export async function getPhotoCounts(jobId: string): Promise<Record<string, number>> {
  const counts = await rows<{ category: string; n: number }>(sql`
    SELECT category, COUNT(*)::int AS n
    FROM job_photos WHERE job_id = ${jobId} AND deleted_at IS NULL
    GROUP BY category
  `);
  return Object.fromEntries(counts.map((c) => [c.category, c.n]));
}
