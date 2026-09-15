"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  sendPurchaseOrder, receiveDelivery, matchExpenseToPo, cancelPurchaseOrder,
} from "./actions";
import { Button, Field, Input, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDate } from "@/lib/dates";
import type { PoDetail, PoLineRow, PoReceiptRow, PoMatchRow } from "./queries";

/**
 * Everything you do to an order after it exists: send it, book in what
 * turned up, and match the supplier's invoice against it.
 */
export function PoPanel({
  po, lines, receipts, matches, matchable, canManage,
}: {
  po: PoDetail;
  lines: PoLineRow[];
  receipts: PoReceiptRow[];
  matches: PoMatchRow[];
  matchable: Array<{ id: string; description: string; expenseDate: string; totalCents: number }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"receive" | "match" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expenseId, setExpenseId] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.id, String(Math.max(0, Number(l.quantity) - Number(l.quantityReceived)))]),
    ),
  );

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setPanel(null);
        setNotice(result.message ?? "Done.");
        router.refresh();
      } else {
        setError(result.message ?? "That didn't work.");
      }
    });
  }

  const outstanding = lines.filter((l) => Number(l.quantityReceived) < Number(l.quantity));

  return (
    <div className="space-y-4">
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {notice ? <Alert tone="good">{notice}</Alert> : null}

      {canManage ? (
        <Card>
          <CardHeader title="What now?" />
          <div className="flex flex-wrap gap-2 p-4">
            {po.status === "draft" ? (
              <Button disabled={pending} onClick={() => run(() => sendPurchaseOrder({ poId: po.id }))}>
                Mark as ordered
              </Button>
            ) : null}

            {outstanding.length > 0 && po.status !== "draft" && po.status !== "cancelled" ? (
              <Button variant="success" onClick={() => setPanel(panel === "receive" ? null : "receive")}>
                Book in a delivery
              </Button>
            ) : null}

            {po.status !== "draft" && po.status !== "cancelled" && matches.length === 0 ? (
              <Button variant="secondary" onClick={() => setPanel(panel === "match" ? null : "match")}>
                Match their invoice
              </Button>
            ) : null}

            {po.status !== "cancelled" && po.status !== "invoiced" ? (
              <Button variant="ghost" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>
                Cancel the order
              </Button>
            ) : null}
          </div>

          {panel === "receive" ? (
            <form
              className="border-t border-ink-200 bg-good-50 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run(() =>
                  receiveDelivery({
                    poId: po.id,
                    receivedOn: data.get("receivedOn"),
                    docketNumber: data.get("docketNumber"),
                    notes: data.get("notes"),
                    lines: outstanding.map((l) => ({ lineId: l.id, quantity: quantities[l.id] ?? "0" })),
                  }),
                );
              }}
            >
              <p className="mb-3 font-bold text-ink-900">What turned up?</p>
              <ul className="mb-3 space-y-2">
                {outstanding.map((line) => {
                  const remaining = Number(line.quantity) - Number(line.quantityReceived);
                  return (
                    <li key={line.id} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink-900">{line.description}</span>
                        <span className="text-sm text-ink-600">
                          {remaining} of {Number(line.quantity)} {line.unit} still to come
                        </span>
                      </span>
                      <Input
                        value={quantities[line.id] ?? ""}
                        onChange={(e) =>
                          setQuantities((q) => ({ ...q, [line.id]: e.target.value }))
                        }
                        inputMode="decimal"
                        className="!w-24 tabular text-right"
                        aria-label={`Quantity received of ${line.description}`}
                      />
                    </li>
                  );
                })}
              </ul>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="When did it arrive?" htmlFor="receivedOn">
                  <Input id="receivedOn" name="receivedOn" type="date" defaultValue={isoDate(new Date())} />
                </Field>
                <Field label="Docket number" htmlFor="docketNumber">
                  <Input id="docketNumber" name="docketNumber" placeholder="DAH-448102" />
                </Field>
                <Field label="Anything wrong with it?" htmlFor="recnotes" className="sm:col-span-2">
                  <Textarea id="recnotes" name="notes" rows={2} placeholder="Two sheets of ply damaged — credited." />
                </Field>
              </div>
              <div className="mt-3 flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setPanel(null)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" variant="success" className="flex-1" disabled={pending}>
                  {pending ? "Saving…" : "Book it in"}
                </Button>
              </div>
            </form>
          ) : null}

          {panel === "match" ? (
            <div className="border-t border-ink-200 bg-info-50 p-4">
              <p className="mb-2 text-sm text-ink-700">
                Pick the expense that came from this supplier&apos;s invoice. We&apos;ll show you the
                difference between what you ordered ({formatMoney(po.subtotalCents)} ex GST) and what
                they billed.
              </p>
              {matchable.length === 0 ? (
                <p className="text-ink-600">
                  No unmatched expenses from {po.supplierName}.{" "}
                  <Link href="/expenses/new" className="underline">Add one first.</Link>
                </p>
              ) : (
                <>
                  <Field label="Their invoice" htmlFor="matchExpense">
                    <Select id="matchExpense" value={expenseId} onChange={(e) => setExpenseId(e.target.value)}>
                      <option value="">Choose an expense…</option>
                      {matchable.map((expense) => (
                        <option key={expense.id} value={expense.id}>
                          {formatDate(expense.expenseDate)} — {expense.description} ({formatMoney(expense.totalCents)})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setPanel(null)} disabled={pending}>
                      Cancel
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={pending || !expenseId}
                      onClick={() => run(() => matchExpenseToPo({ poId: po.id, expenseId }))}
                    >
                      Match it
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {panel === "cancel" ? (
            <div className="border-t border-ink-200 bg-bad-50 p-4">
              <Field label="Why?" htmlFor="cancelReason">
                <Input id="cancelReason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                       placeholder="Ordered from someone else" autoFocus />
              </Field>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setPanel(null)} disabled={pending}>
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={pending}
                  onClick={() => run(() => cancelPurchaseOrder({ poId: po.id, reason: cancelReason }))}
                >
                  Cancel the order
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {receipts.length > 0 ? (
        <Card>
          <CardHeader title="Deliveries" subtitle={`${receipts.length} booked in`} />
          <ul className="divide-y divide-ink-200">
            {receipts.map((receipt) => (
              <li key={receipt.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      {formatDate(receipt.receivedOn)}
                      {receipt.docketNumber ? ` · docket ${receipt.docketNumber}` : ""}
                    </p>
                    <p className="text-sm text-ink-600">
                      {receipt.lines.map((l) => `${Number(l.quantity)} × ${l.description}`).join(", ")}
                    </p>
                    {receipt.notes ? (
                      <p className="mt-1 text-sm text-warn-700">{receipt.notes}</p>
                    ) : null}
                    {receipt.receivedByName ? (
                      <p className="mt-1 text-xs text-ink-500">Booked in by {receipt.receivedByName}</p>
                    ) : null}
                  </div>
                  {receipt.fileId ? (
                    <a
                      href={`/api/files/${receipt.fileId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-sm font-bold text-info-700 underline"
                    >
                      Docket
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {matches.length > 0 ? (
        <Card>
          <CardHeader title="Matched to their invoice" />
          <ul className="divide-y divide-ink-200">
            {matches.map((match) => (
              <li key={match.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/expenses/${match.expenseId}`} className="truncate font-semibold underline">
                    {match.description}
                  </Link>
                  <p className="text-sm text-ink-600">{formatDate(match.expenseDate)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular font-bold">{formatMoney(match.matchedAmountCents)}</p>
                  <p
                    className={`text-sm font-bold ${
                      match.varianceCents === 0
                        ? "text-good-700"
                        : Math.abs(match.varianceCents) > 5000
                          ? "text-bad-700"
                          : "text-warn-700"
                    }`}
                  >
                    {match.varianceCents === 0
                      ? "Exact match"
                      : `${formatMoney(Math.abs(match.varianceCents))} ${match.varianceCents > 0 ? "over" : "under"}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
