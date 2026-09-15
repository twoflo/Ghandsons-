import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ClientOption, SiteOption, TypeOption, CrewOption } from "./job-form";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

/** Everything the job form needs, in one round trip. */
export async function getJobFormOptions() {
  const [clients, sites, jobTypes, crew] = await Promise.all([
    rows<ClientOption>(sql`
      SELECT id, name FROM clients WHERE deleted_at IS NULL ORDER BY name
    `),
    rows<SiteOption>(sql`
      SELECT id, client_id AS "clientId", label, suburb
      FROM sites WHERE deleted_at IS NULL ORDER BY label
    `),
    rows<TypeOption>(sql`
      SELECT id, name FROM job_types WHERE is_active AND deleted_at IS NULL ORDER BY sort_order, name
    `),
    rows<CrewOption>(sql`
      SELECT u.id, u.full_name AS "fullName", wp.trade
      FROM users u LEFT JOIN worker_profiles wp ON wp.user_id = u.id
      WHERE u.deleted_at IS NULL AND u.is_active
      ORDER BY u.full_name
    `),
  ]);
  return { clients, sites, jobTypes, crew };
}
