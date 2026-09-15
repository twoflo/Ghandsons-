import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ExtractedReceipt } from "./types";

/**
 * Turning a read receipt into a pre-filled expense row.
 *
 * All three suggestions are deterministic SQL, not model output — they have
 * to be explainable ("matched on ABN", "the only bathroom on the go"), and
 * the reviewer needs to be able to trust or overrule them at a glance.
 */

export type Suggestions = {
  supplierId: string | null;
  supplierName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  jobId: string | null;
  jobLabel: string | null;
  reason: string;
};

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export async function suggestForReceipt(
  extraction: ExtractedReceipt,
  context: { uploadedBy?: string | null; jobHint?: string | null } = {},
): Promise<Suggestions> {
  const reasons: string[] = [];

  /* ------------------------------ supplier ------------------------------ */
  let supplierId: string | null = null;
  let supplierName: string | null = null;
  let defaultCategoryId: string | null = null;

  const abn = extraction.abn.value?.replace(/\D/g, "");
  if (abn && abn.length === 11) {
    const [byAbn] = await rows<{ id: string; name: string; defaultCategoryId: string | null }>(sql`
      SELECT id, name, default_category_id AS "defaultCategoryId"
      FROM suppliers
      WHERE deleted_at IS NULL AND regexp_replace(COALESCE(abn, ''), '\\D', '', 'g') = ${abn}
      LIMIT 1
    `);
    if (byAbn) {
      supplierId = byAbn.id;
      supplierName = byAbn.name;
      defaultCategoryId = byAbn.defaultCategoryId;
      reasons.push("Supplier matched on ABN");
    }
  }

  const printedName = extraction.supplierName.value?.trim();
  if (!supplierId && printedName) {
    // Aliases first — they're how this supplier's name actually prints on a
    // docket, and they were taught by a human accepting a previous match.
    const [byAlias] = await rows<{ id: string; name: string; defaultCategoryId: string | null }>(sql`
      SELECT s.id, s.name, s.default_category_id AS "defaultCategoryId"
      FROM supplier_aliases a
      JOIN suppliers s ON s.id = a.supplier_id
      WHERE s.deleted_at IS NULL AND similarity(a.alias, ${printedName}) > 0.45
      ORDER BY similarity(a.alias, ${printedName}) DESC
      LIMIT 1
    `);

    if (byAlias) {
      supplierId = byAlias.id;
      supplierName = byAlias.name;
      defaultCategoryId = byAlias.defaultCategoryId;
      reasons.push(`Supplier matched on a name we've seen before ("${printedName}")`);
    } else {
      const [byName] = await rows<{ id: string; name: string; defaultCategoryId: string | null; score: number }>(sql`
        SELECT id, name, default_category_id AS "defaultCategoryId",
               similarity(name, ${printedName}) AS score
        FROM suppliers
        WHERE deleted_at IS NULL AND similarity(name, ${printedName}) > 0.3
        ORDER BY score DESC
        LIMIT 1
      `);
      if (byName) {
        supplierId = byName.id;
        supplierName = byName.name;
        defaultCategoryId = byName.defaultCategoryId;
        reasons.push(`Supplier looks like ${byName.name}`);
      }
    }
  }

  /* ------------------------------ category ------------------------------ */
  let categoryId: string | null = defaultCategoryId;
  let categoryName: string | null = null;

  // Keywords beat the supplier default: a tin of paint from Bunnings is paint,
  // not general hardware.
  const haystack = [
    printedName ?? "",
    ...extraction.lineItems.map((l) => l.description),
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.trim()) {
    const [byKeyword] = await rows<{ id: string; name: string; hits: number }>(sql`
      SELECT c.id, c.name,
             (SELECT COUNT(*) FROM unnest(c.match_keywords) k WHERE ${haystack} LIKE '%' || k || '%') AS hits
      FROM expense_categories c
      WHERE c.is_active AND c.deleted_at IS NULL
      ORDER BY hits DESC, c.sort_order
      LIMIT 1
    `);
    if (byKeyword && Number(byKeyword.hits) > 0) {
      categoryId = byKeyword.id;
      categoryName = byKeyword.name;
      reasons.push(`Category from what's on the docket (${byKeyword.name})`);
    }
  }

  if (categoryId && !categoryName) {
    const [named] = await rows<{ name: string }>(sql`
      SELECT name FROM expense_categories WHERE id = ${categoryId}
    `);
    categoryName = named?.name ?? null;
    if (named) reasons.push(`Category is what we usually use for ${supplierName ?? "this supplier"}`);
  }

  /* -------------------------------- job --------------------------------- */
  let jobId: string | null = context.jobHint ?? null;
  let jobLabel: string | null = null;

  if (jobId) {
    const [job] = await rows<{ jobNumber: string; title: string }>(sql`
      SELECT job_number AS "jobNumber", title FROM jobs WHERE id = ${jobId} AND deleted_at IS NULL
    `);
    if (job) {
      jobLabel = `${job.jobNumber} — ${job.title}`;
      reasons.push("Job taken from where you snapped it");
    } else {
      jobId = null;
    }
  }

  if (!jobId) {
    /*
     * Best guess at the job, in order of how much it tells us:
     *  3 — the uploader booked time on it today
     *  2 — the uploader booked time on it in the last week
     *  1 — there is exactly one job on site at the moment
     * A tie means we don't guess; the reviewer picks.
     */
    const candidates = await rows<{ id: string; jobNumber: string; title: string; score: number }>(sql`
      SELECT j.id, j.job_number AS "jobNumber", j.title,
        (
          CASE WHEN ${context.uploadedBy ?? null}::uuid IS NOT NULL AND EXISTS (
            SELECT 1 FROM time_entries te
            WHERE te.job_id = j.id AND te.user_id = ${context.uploadedBy ?? null}::uuid
              AND te.work_date = CURRENT_DATE AND te.deleted_at IS NULL
          ) THEN 3 ELSE 0 END
          +
          CASE WHEN ${context.uploadedBy ?? null}::uuid IS NOT NULL AND EXISTS (
            SELECT 1 FROM time_entries te
            WHERE te.job_id = j.id AND te.user_id = ${context.uploadedBy ?? null}::uuid
              AND te.work_date >= CURRENT_DATE - 7 AND te.deleted_at IS NULL
          ) THEN 2 ELSE 0 END
          +
          CASE WHEN j.status = 'in_progress' THEN 1 ELSE 0 END
        ) AS score
      FROM jobs j
      WHERE j.deleted_at IS NULL AND j.status IN ('scheduled','in_progress','won')
      ORDER BY score DESC, j.start_date DESC NULLS LAST
      LIMIT 2
    `);

    const best = candidates[0];
    const runnerUp = candidates[1];

    if (best && Number(best.score) >= 2 && (!runnerUp || Number(best.score) > Number(runnerUp.score))) {
      jobId = best.id;
      jobLabel = `${best.jobNumber} — ${best.title}`;
      reasons.push(
        Number(best.score) >= 3
          ? "Job suggested because that's where you were working today"
          : "Job suggested from where you've been working this week",
      );
    } else if (candidates.length > 1) {
      reasons.push("More than one job it could belong to — pick the right one");
    }
  }

  return {
    supplierId,
    supplierName,
    categoryId,
    categoryName,
    jobId,
    jobLabel,
    reason: reasons.join(". ") + (reasons.length ? "." : ""),
  };
}
