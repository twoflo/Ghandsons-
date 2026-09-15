import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ClientOption } from "@/modules/jobs/job-form";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export async function getInvoiceFormOptions() {
  const [clients, jobs, taxRates] = await Promise.all([
    rows<ClientOption>(sql`SELECT id, name FROM clients WHERE deleted_at IS NULL ORDER BY name`),
    rows<{ id: string; jobNumber: string; title: string; clientId: string }>(sql`
      SELECT id, job_number AS "jobNumber", title, client_id AS "clientId"
      FROM jobs WHERE deleted_at IS NULL AND status NOT IN ('lost','cancelled')
      ORDER BY job_number DESC
    `),
    rows<{ id: string; name: string; rateBp: number }>(sql`
      SELECT id, name, rate_bp AS "rateBp" FROM tax_rates
      WHERE is_active AND deleted_at IS NULL ORDER BY is_default DESC, name
    `),
  ]);
  return { clients, jobs, taxRates };
}
