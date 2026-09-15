import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { TemplateEditor } from "@/modules/settings/editors";

export const metadata = { title: "Email wording" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "settings.manage")) redirect("/settings");

  const templates = (await db.execute(sql`
    SELECT id, key, name, subject, body FROM email_templates
    WHERE deleted_at IS NULL ORDER BY name
  `)) as unknown as Array<{ id: string; key: string; name: string; subject: string; body: string }>;

  return <TemplateEditor templates={templates} />;
}
