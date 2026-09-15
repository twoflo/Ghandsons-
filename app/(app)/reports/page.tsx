import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getJobProfit, getProfitByMonth, getCashFlow, getAgedReceivables,
  getTaxSummary, getExpensesByCategory, getReportTotals,
} from "@/modules/reports/queries";
import { formatMoney, formatBp } from "@/lib/money";
import { formatDate, financialYear, isoDate } from "@/lib/dates";
import { PageHeader, Card, CardHeader, StatTile, Badge, Alert } from "@/components/ui";
import { ProfitColumns, PairedColumns, ProfitBars, AgedBars } from "@/components/charts";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const EXPORTS = [
  { key: "invoices", label: "Invoices" },
  { key: "expenses", label: "Expenses" },
  { key: "payments", label: "Payments" },
  { key: "jobs", label: "Jobs & profit" },
  { key: "timesheets", label: "Timesheets" },
  { key: "clients", label: "Clients" },
  { key: "gst", label: "GST detail" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; live?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "reports.view")) redirect("/dashboard");

  const params = await searchParams;
  const fy = financialYear();
  const from = params.from ?? fy.start;
  const to = params.to ?? isoDate(new Date());
  const includeLive = params.live === "1";
  const range = { from, to };

  const [totals, jobProfit, byMonth, cash, aged, tax, byCategory] = await Promise.all([
    getReportTotals(range),
    getJobProfit(range, includeLive),
    getProfitByMonth(range),
    getCashFlow(range),
    getAgedReceivables(),
    getTaxSummary(range),
    getExpensesByCategory(range),
  ]);

  const showProfit = can(user.role, "reports.viewProfit");

  const buckets = [
    { key: "current", label: "Not due yet" },
    { key: "1_30", label: "1–30 days over" },
    { key: "31_60", label: "31–60 days" },
    { key: "61_90", label: "61–90 days" },
    { key: "90_plus", label: "Over 90 days" },
  ].map((bucket) => {
    const items = aged.filter((a) => a.bucket === bucket.key);
    return {
      label: bucket.label,
      cents: items.reduce((a, i) => a + i.balanceCents, 0),
      count: items.length,
    };
  });

  const marginBp =
    totals.revenueCents > 0 ? Math.round((totals.profitCents / totals.revenueCents) * 10_000) : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Reports"
        subtitle={`${formatDate(from)} to ${formatDate(to)} · ${fy.label}`}
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3">
        <label className="flex-1">
          <span className="field-label">From</span>
          <input type="date" name="from" defaultValue={from} className="field-input" />
        </label>
        <label className="flex-1">
          <span className="field-label">To</span>
          <input type="date" name="to" defaultValue={to} className="field-input" />
        </label>
        <button
          type="submit"
          className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-brand-600 bg-brand-600 px-4 font-bold text-white"
        >
          Show
        </button>
        <Link
          href="/reports"
          className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-4 font-bold text-ink-700"
        >
          This financial year
        </Link>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Invoiced (ex GST)" value={formatMoney(totals.revenueCents)} />
        <StatTile label="Costs" value={formatMoney(totals.costCents)} sub="Materials, subbies and approved labour" />
        {showProfit ? (
          <StatTile
            label="Gross profit"
            value={formatMoney(totals.profitCents)}
            sub={`${formatBp(marginBp)} margin`}
            tone={totals.profitCents >= 0 ? "good" : "bad"}
          />
        ) : null}
        <StatTile
          label="GST owed to the ATO"
          value={formatMoney(totals.gstOwedCents)}
          sub="Collected less paid"
          tone={totals.gstOwedCents > 0 ? "warn" : "good"}
        />
      </div>

      <div className="space-y-6">
        {/* ------------------------------ by month ----------------------------- */}
        {showProfit ? (
          <Card>
            <CardHeader
              title="Profit by month"
              subtitle="Invoiced ex GST, less costs booked in that month"
            />
            <div className="p-4">
              <ProfitColumns
                data={byMonth.map((m) => ({ label: m.label, profitCents: m.profitCents }))}
                caption="Profit by month"
              />
              <p className="mt-3 text-sm text-ink-600">
                This is a trading view, not your tax return — costs land in the month they were dated,
                not the month the job finishes. For a job-by-job picture, look below.
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-info-700">
                  Show the numbers
                </summary>
                <table className="mt-2 w-full text-sm">
                  <caption className="sr-only">Profit by month</caption>
                  <thead>
                    <tr className="border-b border-ink-300 text-left text-xs font-bold uppercase text-ink-500">
                      <th scope="col" className="py-1.5">Month</th>
                      <th scope="col" className="py-1.5 text-right">Invoiced</th>
                      <th scope="col" className="py-1.5 text-right">Costs</th>
                      <th scope="col" className="py-1.5 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {byMonth.map((m) => (
                      <tr key={m.month}>
                        <th scope="row" className="py-1.5 text-left font-medium">{m.label}</th>
                        <td className="py-1.5 text-right tabular">{formatMoney(m.revenueCents)}</td>
                        <td className="py-1.5 text-right tabular">{formatMoney(m.costCents)}</td>
                        <td
                          className={`py-1.5 text-right tabular font-bold ${
                            m.profitCents < 0 ? "text-bad-700" : "text-ink-900"
                          }`}
                        >
                          {formatMoney(m.profitCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          </Card>
        ) : null}

        {/* ----------------------------- cash in/out --------------------------- */}
        <Card>
          <CardHeader title="Cash in and out" subtitle="Money that actually moved, including GST" />
          <div className="p-4">
            <PairedColumns
              data={cash.map((c) => ({ label: c.label, a: c.inCents, b: c.outCents }))}
              seriesA="Banked"
              seriesB="Spent"
              caption="Payments received against expenses paid, by month"
            />
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <p className="text-sm font-semibold text-ink-600">Banked</p>
                <p className="tabular text-lg font-black">{formatMoney(totals.cashInCents)}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-600">Spent</p>
                <p className="tabular text-lg font-black">{formatMoney(totals.cashOutCents)}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-600">Net</p>
                <p
                  className={`tabular text-lg font-black ${
                    totals.cashInCents - totals.cashOutCents < 0 ? "text-bad-700" : "text-good-700"
                  }`}
                >
                  {formatMoney(totals.cashInCents - totals.cashOutCents)}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* ---------------------------- profit per job ------------------------- */}
        {showProfit ? (
          <Card>
            <CardHeader
              title="Profit per job"
              subtitle={includeLive ? "Including jobs still running" : "Finished jobs only"}
              action={
                <Link
                  href={`/reports?from=${from}&to=${to}${includeLive ? "" : "&live=1"}`}
                  className="text-sm font-bold text-info-700 underline"
                >
                  {includeLive ? "Finished only" : "Include live jobs"}
                </Link>
              }
            />
            <div className="p-4">
              {includeLive ? (
                <div className="mb-3">
                  <Alert tone="warn">
                    Live jobs flatter the numbers: the contract is counted in full but only the costs
                    booked so far are against it. Use this to spot a job going bad, not to work out
                    what you made.
                  </Alert>
                </div>
              ) : null}
              <ProfitBars
                data={jobProfit.slice(0, 12).map((job) => ({
                  label: `${job.jobNumber} ${job.title}`,
                  profitCents: job.profitCents,
                }))}
                caption="Profit per job, biggest first"
              />
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-info-700">
                  Show the numbers
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-sm">
                    <caption className="sr-only">Profit per job</caption>
                    <thead>
                      <tr className="border-b border-ink-300 text-left text-xs font-bold uppercase text-ink-500">
                        <th scope="col" className="py-1.5">Job</th>
                        <th scope="col" className="py-1.5">Client</th>
                        <th scope="col" className="py-1.5 text-right">Contract</th>
                        <th scope="col" className="py-1.5 text-right">Cost</th>
                        <th scope="col" className="py-1.5 text-right">Profit</th>
                        <th scope="col" className="py-1.5 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-200">
                      {jobProfit.map((job) => (
                        <tr key={job.jobId}>
                          <th scope="row" className="py-1.5 text-left font-medium">
                            <Link href={`/jobs/${job.jobId}`} className="underline">{job.jobNumber}</Link>{" "}
                            {job.title}
                          </th>
                          <td className="py-1.5 text-ink-600">{job.clientName}</td>
                          <td className="py-1.5 text-right tabular">{formatMoney(job.contractCents)}</td>
                          <td className="py-1.5 text-right tabular">{formatMoney(job.actualCostCents)}</td>
                          <td
                            className={`py-1.5 text-right tabular font-bold ${
                              job.profitCents < 0 ? "text-bad-700" : "text-ink-900"
                            }`}
                          >
                            {formatMoney(job.profitCents)}
                          </td>
                          <td className="py-1.5 text-right tabular">{formatBp(job.marginBp)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </Card>
        ) : null}

        {/* --------------------------- aged receivables ------------------------ */}
        <Card>
          <CardHeader
            title="Who owes you"
            subtitle={`${formatMoney(totals.outstandingCents)} outstanding across ${aged.length} invoices`}
          />
          <div className="p-4">
            <AgedBars buckets={buckets} caption="Outstanding invoices by how overdue they are" />
            {aged.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <caption className="sr-only">Outstanding invoices</caption>
                  <thead>
                    <tr className="border-b border-ink-300 text-left text-xs font-bold uppercase text-ink-500">
                      <th scope="col" className="py-1.5">Invoice</th>
                      <th scope="col" className="py-1.5">Client</th>
                      <th scope="col" className="py-1.5">Due</th>
                      <th scope="col" className="py-1.5 text-right">Owing</th>
                      <th scope="col" className="py-1.5 text-right">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {aged.map((row) => (
                      <tr key={row.invoiceId}>
                        <th scope="row" className="py-1.5 text-left font-medium">
                          <Link href={`/invoices/${row.invoiceId}`} className="underline">
                            {row.invoiceNumber}
                          </Link>
                        </th>
                        <td className="py-1.5 text-ink-700">{row.clientName}</td>
                        <td className="py-1.5 text-ink-600">{row.dueDate ? formatDate(row.dueDate) : "—"}</td>
                        <td className="py-1.5 text-right tabular font-bold">{formatMoney(row.balanceCents)}</td>
                        <td className="py-1.5 text-right">
                          {row.daysOverdue > 0 ? (
                            <Badge tone={row.daysOverdue > 60 ? "bad" : "warn"}>{row.daysOverdue}d</Badge>
                          ) : (
                            <span className="text-ink-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </Card>

        {/* ------------------------------ tax summary -------------------------- */}
        <Card>
          <CardHeader
            title="For the accountant"
            subtitle="GST by quarter, on a cash-in / cash-out basis"
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">GST summary by quarter</caption>
              <thead>
                <tr className="border-b border-ink-300 text-left text-xs font-bold uppercase text-ink-500">
                  <th scope="col" className="px-4 py-2">Quarter</th>
                  <th scope="col" className="px-2 py-2 text-right">Sales inc GST</th>
                  <th scope="col" className="px-2 py-2 text-right">GST collected</th>
                  <th scope="col" className="px-2 py-2 text-right">Purchases inc GST</th>
                  <th scope="col" className="px-2 py-2 text-right">GST paid</th>
                  <th scope="col" className="px-4 py-2 text-right">Net GST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {tax.map((period) => (
                  <tr key={period.period}>
                    <th scope="row" className="px-4 py-2 text-left font-medium">{period.label}</th>
                    <td className="px-2 py-2 text-right tabular">{formatMoney(period.salesIncGstCents)}</td>
                    <td className="px-2 py-2 text-right tabular">{formatMoney(period.gstCollectedCents)}</td>
                    <td className="px-2 py-2 text-right tabular">{formatMoney(period.purchasesIncGstCents)}</td>
                    <td className="px-2 py-2 text-right tabular">{formatMoney(period.gstPaidCents)}</td>
                    <td
                      className={`px-4 py-2 text-right tabular font-bold ${
                        period.netGstCents > 0 ? "text-bad-700" : "text-good-700"
                      }`}
                    >
                      {formatMoney(period.netGstCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-300 font-bold">
                  <th scope="row" className="px-4 py-2 text-left">Total</th>
                  <td className="px-2 py-2 text-right tabular">
                    {formatMoney(tax.reduce((a, p) => a + p.salesIncGstCents, 0))}
                  </td>
                  <td className="px-2 py-2 text-right tabular">
                    {formatMoney(tax.reduce((a, p) => a + p.gstCollectedCents, 0))}
                  </td>
                  <td className="px-2 py-2 text-right tabular">
                    {formatMoney(tax.reduce((a, p) => a + p.purchasesIncGstCents, 0))}
                  </td>
                  <td className="px-2 py-2 text-right tabular">
                    {formatMoney(tax.reduce((a, p) => a + p.gstPaidCents, 0))}
                  </td>
                  <td className="px-4 py-2 text-right tabular">
                    {formatMoney(tax.reduce((a, p) => a + p.netGstCents, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="px-4 py-3 text-sm text-ink-600">
            A positive net figure is what you owe the ATO for the quarter. This is a summary to hand
            over, not a lodgement — your accountant will want the GST detail CSV below as well.
          </p>
        </Card>

        {/* --------------------------- spend by category ----------------------- */}
        <Card>
          <CardHeader title="Where the money went" subtitle="Expenses by category, inc GST" />
          <ul className="divide-y divide-ink-200">
            {byCategory.map((category) => {
              const biggest = byCategory[0]?.totalCents ?? 1;
              return (
                <li key={category.categoryName} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink-900">{category.categoryName}</span>
                    <span className="tabular shrink-0 font-bold">{formatMoney(category.totalCents)}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ink-200">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(category.totalCents / biggest) * 100}%`,
                        background: "#2a78d6",
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {category.count} expense{category.count === 1 ? "" : "s"} ·{" "}
                    {formatMoney(category.taxCents)} GST
                  </p>
                </li>
              );
            })}
            {byCategory.length === 0 ? (
              <li className="px-4 py-5 text-ink-600">No expenses in this period.</li>
            ) : null}
          </ul>
        </Card>

        {/* -------------------------------- exports ---------------------------- */}
        {can(user.role, "reports.export") ? (
          <Card>
            <CardHeader
              title="Send it to the accountant"
              subtitle="Everything as CSV, for the date range above. Opens straight in Excel."
            />
            <div className="flex flex-wrap gap-2 p-4">
              {EXPORTS.map((item) => (
                <a
                  key={item.key}
                  href={`/api/export?dataset=${item.key}&from=${from}&to=${to}`}
                  className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-4 font-semibold text-ink-800 hover:bg-ink-100"
                >
                  ⬇️ {item.label}
                </a>
              ))}
              {can(user.role, "audit.view") ? (
                <a
                  href={`/api/export?dataset=audit&from=${from}&to=${to}`}
                  className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-4 font-semibold text-ink-800 hover:bg-ink-100"
                >
                  ⬇️ Audit trail
                </a>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
