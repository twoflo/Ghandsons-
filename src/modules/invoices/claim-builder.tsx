"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClaimFromJob } from "./actions";
import { Button, Field, Input, Select, Alert, Card, CardHeader } from "@/components/ui";
import { formatMoney, roundHalf } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { JobClaimContext, BillableExpense, BillableVariation } from "./queries";

/**
 * Raising a claim off a job, the way a builder describes it: "we're 55% done,
 * plus the two variations she signed, plus the scaffold hire we fronted."
 *
 * The percentage is CUMULATIVE against the contract — the amount on this
 * invoice is that figure less whatever has already been claimed, which is how
 * progress claims actually work and where hand-written ones go wrong.
 */
export function ClaimBuilder({
  job,
  expenses,
  variations,
  defaultTermsDays,
  defaultMarkupBp,
}: {
  job: JobClaimContext;
  expenses: BillableExpense[];
  variations: BillableVariation[];
  defaultTermsDays: number;
  defaultMarkupBp: number;
}) {
  const router = useRouter();
  const [type, setType] = useState<"deposit" | "progress" | "final" | "standard">(
    job.alreadyClaimedCents === 0 ? "deposit" : "progress",
  );
  const [percent, setPercent] = useState(job.alreadyClaimedCents === 0 ? "10" : "50");
  const [description, setDescription] = useState("");
  const [expenseIds, setExpenseIds] = useState<string[]>([]);
  const [markupBp, setMarkupBp] = useState(defaultMarkupBp);
  const [variationIds, setVariationIds] = useState<string[]>(variations.map((v) => v.id));
  const [terms, setTerms] = useState(job.clientTermsDays ?? defaultTermsDays);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const percentBp = Math.round((Number.parseFloat(percent) || 0) * 100);

  const preview = useMemo(() => {
    const cumulative = roundHalf((job.revisedContractCents * percentBp) / 10_000);
    const claimLine = Math.max(0, cumulative - job.alreadyClaimedCents);
    const expenseTotal = expenses
      .filter((e) => expenseIds.includes(e.id))
      .reduce((a, e) => a + roundHalf((e.subtotalCents * (10_000 + markupBp)) / 10_000), 0);
    const variationTotal = variations
      .filter((v) => variationIds.includes(v.id))
      .reduce((a, v) => a + v.subtotalCents, 0);
    const subtotal = claimLine + expenseTotal + variationTotal;
    const gst = roundHalf(subtotal * 0.1);
    return { cumulative, claimLine, expenseTotal, variationTotal, subtotal, gst, total: subtotal + gst };
  }, [job, percentBp, expenses, expenseIds, markupBp, variations, variationIds]);

  const claimedPct =
    job.revisedContractCents > 0
      ? Math.round((job.alreadyClaimedCents / job.revisedContractCents) * 100)
      : 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createClaimFromJob({
        jobId: job.jobId,
        type,
        percentBp,
        description,
        includeExpenseIds: expenseIds,
        expenseMarkupBp: markupBp,
        includeVariationIds: variationIds,
        paymentTermsDays: terms,
      });
      if (result.ok) {
        router.push(`/invoices/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`${job.jobNumber} — ${job.jobTitle}`}
          subtitle={`${job.clientName} · contract ${formatMoney(job.revisedContractCents)} ex GST`}
        />
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-ink-600">Contract</p>
            <p className="tabular text-lg font-black">{formatMoney(job.contractValueCents)}</p>
            {job.approvedVariationsCents > 0 ? (
              <p className="text-xs text-ink-500">
                + {formatMoney(job.approvedVariationsCents)} approved variations
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-600">Claimed so far</p>
            <p className="tabular text-lg font-black">{formatMoney(job.alreadyClaimedCents)}</p>
            <p className="text-xs text-ink-500">{claimedPct}% of the contract</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-600">Left to claim</p>
            <p className="tabular text-lg font-black text-good-700">
              {formatMoney(Math.max(0, job.revisedContractCents - job.alreadyClaimedCents))}
            </p>
          </div>
        </div>
      </Card>

      {error ? <Alert tone="bad">{error}</Alert> : null}

      <Card>
        <CardHeader title="The claim" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="What sort of claim?" htmlFor="claimType">
            <Select id="claimType" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="deposit">Deposit</option>
              <option value="progress">Progress claim</option>
              <option value="final">Final claim</option>
              <option value="standard">Just the extras, no percentage</option>
            </Select>
          </Field>

          {type !== "standard" ? (
            <Field
              label="Claim up to what percentage?"
              htmlFor="claimPercent"
              hint={`Cumulative. ${formatMoney(preview.cumulative)} of the contract, less ${formatMoney(job.alreadyClaimedCents)} already claimed.`}
            >
              <div className="flex items-center gap-2">
                <Input
                  id="claimPercent"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="1"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="tabular text-right"
                />
                <span className="font-bold text-ink-600">%</span>
              </div>
            </Field>
          ) : null}

          <Field label="Wording on the invoice" htmlFor="claimDesc" className="sm:col-span-2"
                 hint="Leave blank and we'll write a sensible line for you.">
            <Input id="claimDesc" value={description} onChange={(e) => setDescription(e.target.value)}
                   placeholder="e.g. Progress claim 4 — first floor frame and roof structure" />
          </Field>

          <Field label="Payment terms" htmlFor="claimTerms">
            <div className="flex items-center gap-2">
              <Input id="claimTerms" type="number" min={0} max={120} value={terms}
                     onChange={(e) => setTerms(Number.parseInt(e.target.value, 10) || 0)}
                     className="tabular text-right" />
              <span className="font-semibold text-ink-600">days</span>
            </div>
          </Field>
        </div>
      </Card>

      {variations.length > 0 ? (
        <Card>
          <CardHeader
            title="Approved variations"
            subtitle="Signed off and not yet billed. Tick to add them."
          />
          <ul className="divide-y divide-ink-200">
            {variations.map((variation) => (
              <li key={variation.id}>
                <label className="flex min-h-[var(--tap)] cursor-pointer items-center gap-3 px-4 py-3 hover:bg-ink-50">
                  <input
                    type="checkbox"
                    checked={variationIds.includes(variation.id)}
                    onChange={(e) =>
                      setVariationIds(
                        e.target.checked
                          ? [...variationIds, variation.id]
                          : variationIds.filter((id) => id !== variation.id),
                      )
                    }
                    className="h-5 w-5 rounded border-2 border-ink-400"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink-900">
                      {variation.variationNumber} — {variation.title}
                    </span>
                    <span className="text-sm text-ink-600">
                      Approved {variation.approvedAt ? formatDate(variation.approvedAt) : ""}
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-bold">{formatMoney(variation.subtotalCents)}</span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {expenses.length > 0 ? (
        <Card>
          <CardHeader
            title="Costs you've fronted"
            subtitle="Billable expenses on this job that haven't been charged on yet"
            action={
              <label className="flex items-center gap-2 text-sm font-semibold">
                Markup
                <Input
                  type="number"
                  min={0}
                  max={200}
                  value={markupBp / 100}
                  onChange={(e) => setMarkupBp(Math.round((Number.parseFloat(e.target.value) || 0) * 100))}
                  className="!min-h-9 w-20 tabular text-right"
                  aria-label="Markup percent on expenses"
                />
                %
              </label>
            }
          />
          <div className="border-b border-ink-200 px-4 py-2">
            <button
              type="button"
              onClick={() =>
                setExpenseIds(expenseIds.length === expenses.length ? [] : expenses.map((e) => e.id))
              }
              className="text-sm font-bold text-info-700 underline"
            >
              {expenseIds.length === expenses.length ? "Untick everything" : "Tick everything"}
            </button>
          </div>
          <ul className="max-h-96 divide-y divide-ink-200 overflow-y-auto">
            {expenses.map((expense) => {
              const charged = roundHalf((expense.subtotalCents * (10_000 + markupBp)) / 10_000);
              return (
                <li key={expense.id}>
                  <label className="flex min-h-[var(--tap)] cursor-pointer items-center gap-3 px-4 py-3 hover:bg-ink-50">
                    <input
                      type="checkbox"
                      checked={expenseIds.includes(expense.id)}
                      onChange={(e) =>
                        setExpenseIds(
                          e.target.checked
                            ? [...expenseIds, expense.id]
                            : expenseIds.filter((id) => id !== expense.id),
                        )
                      }
                      className="h-5 w-5 rounded border-2 border-ink-400"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink-900">{expense.description}</span>
                      <span className="text-sm text-ink-600">
                        {formatDate(expense.expenseDate)}
                        {expense.supplierName ? ` · ${expense.supplierName}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tabular block font-bold">{formatMoney(charged)}</span>
                      {markupBp > 0 ? (
                        <span className="text-xs text-ink-500">cost {formatMoney(expense.subtotalCents)}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="What the invoice will come to" />
        <dl className="space-y-1.5 p-4">
          {preview.claimLine > 0 ? (
            <Row label={`${type === "deposit" ? "Deposit" : "Progress claim"} to ${percent}%`} value={preview.claimLine} />
          ) : null}
          {preview.variationTotal > 0 ? <Row label="Variations" value={preview.variationTotal} /> : null}
          {preview.expenseTotal > 0 ? <Row label="Costs on-charged" value={preview.expenseTotal} /> : null}
          <div className="border-t border-ink-300 pt-1.5">
            <Row label="Subtotal (ex GST)" value={preview.subtotal} />
          </div>
          <Row label="GST" value={preview.gst} />
          <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink-300 pt-2">
            <dt className="font-bold text-ink-900">Invoice total</dt>
            <dd className="tabular text-xl font-black">{formatMoney(preview.total)}</dd>
          </div>
        </dl>
      </Card>

      <div className="sticky bottom-20 z-20 flex gap-3 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
        <Button type="button" variant="secondary" size="lg" className="flex-1"
                onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-[2]"
          disabled={pending || preview.subtotal <= 0}
          onClick={submit}
        >
          {pending ? "Building…" : `Create draft for ${formatMoney(preview.total)}`}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-semibold text-ink-700">{label}</dt>
      <dd className="tabular font-semibold">{formatMoney(value)}</dd>
    </div>
  );
}
