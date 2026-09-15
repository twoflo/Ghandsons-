import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { NumberingEditor } from "@/modules/settings/editors";

export const metadata = { title: "Numbering" };
export const dynamic = "force-dynamic";

export default async function NumberingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "settings.manage")) redirect("/settings");

  const sequences = (await db.execute(sql`
    SELECT key, prefix, next_value AS "nextValue", padding
    FROM number_sequences ORDER BY key
  `)) as unknown as Array<{ key: string; prefix: string; nextValue: number; padding: number }>;

  return <NumberingEditor sequences={sequences} />;
}
