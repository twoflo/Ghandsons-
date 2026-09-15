import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getPriceBook } from "@/modules/quotes/queries";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export async function getPoFormOptions() {
  const [suppliers, jobs, priceBook, taxRates] = await Promise.all([
    rows<{ id: string; name: string }>(sql`
      SELECT id, name FROM suppliers WHERE deleted_at IS NULL ORDER BY name
    `),
    rows<{ id: string; jobNumber: string; title: string }>(sql`
      SELECT id, job_number AS "jobNumber", title FROM jobs
      WHERE deleted_at IS NULL AND status IN ('won','scheduled','in_progress','complete')
      ORDER BY job_number DESC
    `),
    getPriceBook(),
    rows<{ id: string; name: string; rateBp: number }>(sql`
      SELECT id, name, rate_bp AS "rateBp" FROM tax_rates
      WHERE is_active AND deleted_at IS NULL ORDER BY is_default DESC, name
    `),
  ]);
  return { suppliers, jobs, priceBook, taxRates };
}
