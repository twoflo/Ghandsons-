import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listVariations, getVariationLines } from "@/modules/variations/queries";
import { getPriceBook } from "@/modules/quotes/queries";
import { getSettings } from "@/lib/settings";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { VariationPanel } from "@/modules/variations/variation-panel";

export const dynamic = "force-dynamic";

export default async function JobVariationsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const [variations, priceBook, settings, taxRates] = await Promise.all([
    listVariations({ jobId: id }),
    getPriceBook(),
    getSettings(),
    db.execute(sql`
      SELECT id, name, rate_bp AS "rateBp" FROM tax_rates
      WHERE is_active AND deleted_at IS NULL ORDER BY is_default DESC, name
    `) as unknown as Promise<Array<{ id: string; name: string; rateBp: number }>>,
  ]);

  const withLines = await Promise.all(
    variations.map(async (variation) => ({
      ...variation,
      lines: await getVariationLines(variation.id),
    })),
  );

  return (
    <VariationPanel
      jobId={id}
      variations={withLines}
      priceBook={priceBook}
      taxRates={taxRates}
      defaultMarkupBp={settings.defaultMarkupBp}
      canManage={can(user.role, "variations.manage")}
      canApprove={can(user.role, "variations.approve")}
      showCost={can(user.role, "jobs.viewMargin")}
    />
  );
}
