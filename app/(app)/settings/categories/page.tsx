import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { CategoryEditor } from "@/modules/settings/editors";

export const metadata = { title: "Categories & job types" };
export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "settings.manage")) redirect("/settings");

  const [categories, jobTypes] = await Promise.all([
    db.execute(sql`
      SELECT id, name, kind::text AS kind, default_billable AS "defaultBillable",
             gst_applicable AS "gstApplicable", match_keywords AS "matchKeywords",
             is_active AS "isActive"
      FROM expense_categories WHERE deleted_at IS NULL ORDER BY sort_order, name
    `) as unknown as Promise<Array<{
      id: string; name: string; kind: string; defaultBillable: boolean;
      gstApplicable: boolean; matchKeywords: string[]; isActive: boolean;
    }>>,
    db.execute(sql`
      SELECT id, name, colour, default_markup_bp AS "defaultMarkupBp", is_active AS "isActive"
      FROM job_types WHERE deleted_at IS NULL ORDER BY sort_order, name
    `) as unknown as Promise<Array<{
      id: string; name: string; colour: string; defaultMarkupBp: number; isActive: boolean;
    }>>,
  ]);

  return <CategoryEditor categories={categories} jobTypes={jobTypes} />;
}
