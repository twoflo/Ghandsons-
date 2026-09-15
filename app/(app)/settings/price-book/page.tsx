import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PriceBookEditor } from "@/modules/settings/editors";

export const metadata = { title: "Price book" };
export const dynamic = "force-dynamic";

export default async function PriceBookPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "settings.manage")) redirect("/settings");

  const [items, taxRates] = await Promise.all([
    db.execute(sql`
      SELECT id, code, name, kind::text AS kind, unit,
             unit_cost_cents AS "unitCostCents", default_markup_bp AS "defaultMarkupBp",
             is_active AS "isActive", tax_rate_id AS "taxRateId"
      FROM price_book_items WHERE deleted_at IS NULL ORDER BY kind, name
    `) as unknown as Promise<Array<{
      id: string; code: string; name: string; kind: string; unit: string;
      unitCostCents: number; defaultMarkupBp: number; isActive: boolean; taxRateId: string | null;
    }>>,
    db.execute(sql`
      SELECT id, name FROM tax_rates WHERE is_active AND deleted_at IS NULL ORDER BY is_default DESC
    `) as unknown as Promise<Array<{ id: string; name: string }>>,
  ]);

  return <PriceBookEditor items={items} taxRates={taxRates} />;
}
