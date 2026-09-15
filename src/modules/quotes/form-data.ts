import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getPriceBook } from "./queries";
import type { ClientOption, SiteOption } from "@/modules/jobs/job-form";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export async function getQuoteFormOptions() {
  const [clients, sites, jobs, priceBook, taxRates] = await Promise.all([
    rows<ClientOption>(sql`SELECT id, name FROM clients WHERE deleted_at IS NULL ORDER BY name`),
    rows<SiteOption>(sql`
      SELECT id, client_id AS "clientId", label, suburb FROM sites
      WHERE deleted_at IS NULL ORDER BY label
    `),
    rows<{ id: string; jobNumber: string; title: string }>(sql`
      SELECT id, job_number AS "jobNumber", title FROM jobs
      WHERE deleted_at IS NULL AND status IN ('lead','quoted','won','scheduled','in_progress')
      ORDER BY job_number DESC
    `),
    getPriceBook(),
    rows<{ id: string; name: string; rateBp: number }>(sql`
      SELECT id, name, rate_bp AS "rateBp" FROM tax_rates
      WHERE is_active AND deleted_at IS NULL ORDER BY is_default DESC, name
    `),
  ]);
  return { clients, sites, jobs, priceBook, taxRates };
}
