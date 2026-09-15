import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { getQuoteFormOptions } from "@/modules/quotes/form-data";
import { QuoteForm } from "@/modules/quotes/quote-form";
import { newLine } from "@/modules/quotes/editor-line";
import { PageHeader } from "@/components/ui";
import { isoDate, addDaysIso } from "@/lib/dates";

export const metadata = { title: "New quote" };
export const dynamic = "force-dynamic";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; jobId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "quotes.manage")) redirect("/quotes");

  const [{ clientId, jobId }, options, settings] = await Promise.all([
    searchParams, getQuoteFormOptions(), getSettings(),
  ]);

  const defaultRate = options.taxRates.find((r) => r.rateBp > 0) ?? options.taxRates[0];
  const today = isoDate(new Date());

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New quote"
        subtitle="Price it in costs. The margin and the client's price follow on."
        back={{ href: "/quotes", label: "All quotes" }}
      />
      <QuoteForm
        {...options}
        showCost={can(user.role, "jobs.viewMargin")}
        initial={{
          clientId: clientId ?? "",
          siteId: "",
          jobId: jobId ?? "",
          title: "",
          issueDate: today,
          validUntil: addDaysIso(today, settings.quoteValidDays),
          globalMarkupBp: settings.defaultMarkupBp,
          scopeOfWork: "",
          exclusions: "",
          terms: settings.quoteTerms ?? "",
          internalNotes: "",
          lines: [newLine(0, defaultRate?.id ?? null, defaultRate?.rateBp ?? 0)],
        }}
      />
    </div>
  );
}
