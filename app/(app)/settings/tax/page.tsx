import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { TaxRateEditor } from "@/modules/settings/editors";

export const metadata = { title: "GST & tax rates" };
export const dynamic = "force-dynamic";

export default async function TaxPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "settings.manage")) redirect("/settings");

  const rates = (await db.execute(sql`
    SELECT id, name, code, rate_bp AS "rateBp", is_default AS "isDefault", is_active AS "isActive"
    FROM tax_rates WHERE deleted_at IS NULL ORDER BY is_default DESC, name
  `)) as unknown as Array<{ id: string; name: string; code: string; rateBp: number; isDefault: boolean; isActive: boolean }>;

  return <TaxRateEditor rates={rates} />;
}
