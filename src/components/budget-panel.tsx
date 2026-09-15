import { formatMoney, formatHours, formatBp, marginBp } from "@/lib/money";
import { Progress, Badge, Card, CardHeader } from "@/components/ui";
import type { JobFinancials } from "@/modules/jobs/queries";

/**
 * Budget vs actual, the panel the owner checks before he agrees to anything.
 * Everything here is derived from time entries and expenses — there is no
 * stored "actual cost" that could be stale.
 */
export function BudgetPanel({
  f,
  showMargin,
  isFinished,
}: {
  f: JobFinancials;
  showMargin: boolean;
  /** Complete, invoiced or paid — costs are in, so profit is real rather than forecast. */
  isFinished: boolean;
}) {
  const rows = [
    { label: "Labour", budget: f.budgetLabourCents, actual: f.actualLabourCents, extra: formatHours(f.actualLabourMinutes) },
    { label: "Materials", budget: f.budgetMaterialCents, actual: f.actualMaterialCents },
    { label: "Subcontractors", budget: f.budgetSubcontractorCents, actual: f.actualSubcontractorCents },
    { label: "Plant & hire", budget: f.budgetPlantCents, actual: f.actualPlantCents },
    { label: "Other", budget: f.budgetOtherCents, actual: f.actualOtherCents },
  ].filter((r) => r.budget > 0 || r.actual > 0);

  const over = f.budgetVarianceCents > 0;
  const forecastOver = f.forecastVarianceCents > 0;

  /*
   * Mid-job, comparing the whole contract against costs booked so far would
   * show an absurd margin. Until the job is finished we forecast the final
   * cost as the greater of the budget and everything already spent,
   * committed or sitting in unapproved timesheets.
   */
  const forecastCostCents = isFinished
    ? f.actualTotalCents
    : Math.max(
        f.revisedBudgetCents,
        f.actualTotalCents + f.pendingLabourCents + f.committedCents,
      );
  const profitCents = f.revisedContractCents - forecastCostCents;
  const profitMargin = f.revisedContractCents > 0 ? marginBp(forecastCostCents, f.revisedContractCents) : 0;

  return (
    <Card>
      <CardHeader
        title="Budget vs actual"
        subtitle="Actual cost comes from approved timesheets and expenses"
        action={
          over ? (
            <Badge tone="bad">{formatMoney(f.budgetVarianceCents)} over</Badge>
          ) : forecastOver ? (
            <Badge tone="warn">Forecast {formatMoney(f.forecastVarianceCents)} over</Badge>
          ) : (
            <Badge tone="good">{formatMoney(Math.abs(f.budgetVarianceCents))} left</Badge>
          )
        }
      />

      <div className="p-4">
        <div className="mb-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-bold text-ink-700">Total spend</span>
            <span className="tabular text-sm font-bold text-ink-900">
              {formatMoney(f.actualTotalCents)} of {formatMoney(f.revisedBudgetCents)}
            </span>
          </div>
          <Progress
            value={f.actualTotalCents}
            max={f.revisedBudgetCents || 1}
            tone={over ? "bad" : f.actualTotalCents / (f.revisedBudgetCents || 1) > 0.85 ? "warn" : "good"}
            label="Total spend against budget"
          />
          {f.pendingLabourCents > 0 || f.committedCents > 0 ? (
            <p className="mt-1.5 text-sm text-ink-600">
              Plus{" "}
              {f.pendingLabourCents > 0 ? (
                <strong className="tabular">{formatMoney(f.pendingLabourCents)}</strong>
              ) : null}
              {f.pendingLabourCents > 0 ? " in timesheets not yet approved" : ""}
              {f.pendingLabourCents > 0 && f.committedCents > 0 ? " and " : ""}
              {f.committedCents > 0 ? (
                <>
                  <strong className="tabular">{formatMoney(f.committedCents)}</strong> already ordered
                </>
              ) : null}
              .
            </p>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <caption className="sr-only">Budget compared with actual cost, by category</caption>
            <thead>
              <tr className="border-b border-ink-300 text-left text-xs font-bold uppercase tracking-wide text-ink-500">
                <th scope="col" className="py-2">Category</th>
                <th scope="col" className="py-2 text-right">Budget</th>
                <th scope="col" className="py-2 text-right">Actual</th>
                <th scope="col" className="py-2 text-right">Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {rows.map((row) => {
                const remaining = row.budget - row.actual;
                return (
                  <tr key={row.label}>
                    <th scope="row" className="py-2.5 text-left font-semibold text-ink-800">
                      {row.label}
                      {row.extra ? <span className="ml-2 font-normal text-ink-500">{row.extra}</span> : null}
                    </th>
                    <td className="py-2.5 text-right tabular text-ink-700">{formatMoney(row.budget)}</td>
                    <td className="py-2.5 text-right tabular font-semibold text-ink-900">{formatMoney(row.actual)}</td>
                    <td
                      className={`py-2.5 text-right tabular font-bold ${
                        remaining < 0 ? "text-bad-700" : "text-good-700"
                      }`}
                    >
                      {remaining < 0 ? `(${formatMoney(-remaining)})` : formatMoney(remaining)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-300 font-bold">
                <th scope="row" className="py-2.5 text-left">Total</th>
                <td className="py-2.5 text-right tabular">{formatMoney(f.revisedBudgetCents)}</td>
                <td className="py-2.5 text-right tabular">{formatMoney(f.actualTotalCents)}</td>
                <td className={`py-2.5 text-right tabular ${over ? "text-bad-700" : "text-good-700"}`}>
                  {over
                    ? `(${formatMoney(f.budgetVarianceCents)})`
                    : formatMoney(-f.budgetVarianceCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {showMargin ? (
          <div className="mt-5 grid gap-3 border-t border-ink-200 pt-4 sm:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-ink-600">Contract (ex GST)</p>
              <p className="tabular text-lg font-black text-ink-900">
                {formatMoney(f.revisedContractCents)}
              </p>
              {f.approvedVariationsCents > 0 ? (
                <p className="text-xs text-ink-500">
                  includes {formatMoney(f.approvedVariationsCents)} of variations
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-600">
                {isFinished ? "Profit" : "Profit if it lands on budget"}
              </p>
              <p className={`tabular text-lg font-black ${profitCents < 0 ? "text-bad-700" : "text-good-700"}`}>
                {formatMoney(profitCents)}
              </p>
              <p className="text-xs text-ink-500">
                {isFinished
                  ? "contract less what it actually cost"
                  : `contract less a forecast cost of ${formatMoney(forecastCostCents)}`}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-600">Margin</p>
              <p className="tabular text-lg font-black text-ink-900">{formatBp(profitMargin)}</p>
              <p className="text-xs text-ink-500">
                {isFinished ? "on the final cost" : "forecast at completion"}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 border-t border-ink-200 pt-4 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-ink-600">Invoiced</p>
            <p className="tabular text-lg font-bold text-ink-900">{formatMoney(f.invoicedExTaxCents)}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-600">Still owed</p>
            <p className={`tabular text-lg font-bold ${f.outstandingCents > 0 ? "text-bad-700" : "text-ink-900"}`}>
              {formatMoney(f.outstandingCents)}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-600">Costs not billed on</p>
            <p className={`tabular text-lg font-bold ${f.unbilledBillableCents > 0 ? "text-warn-700" : "text-ink-900"}`}>
              {formatMoney(f.unbilledBillableCents)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
