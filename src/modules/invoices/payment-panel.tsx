"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPayment, reversePayment, markInvoiceSent, voidInvoice } from "./actions";
import { Button, Field, Input, MoneyInput, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import { formatMoney, centsToInput } from "@/lib/money";
import { formatDate, isoDate } from "@/lib/dates";
import type { PaymentRow } from "./queries";

const METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "direct_debit", label: "Direct debit" },
  { value: "other", label: "Something else" },
];

export function PaymentPanel({
  invoiceId,
  invoiceNumber,
  status,
  balanceCents,
  totalCents,
  payments,
  canVoid,
}: {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  balanceCents: number;
  totalCents: number;
  payments: PaymentRow[];
  canVoid: boolean;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"pay" | "void" | null>(null);
  const [amount, setAmount] = useState(centsToInput(balanceCents));
  const [paidOn, setPaidOn] = useState(isoDate(new Date()));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState(invoiceNumber);
  const [voidReason, setVoidReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const settled = balanceCents <= 0 && totalCents > 0;

  return (
    <Card>
      <CardHeader
        title="Getting paid"
        subtitle={
          status === "void"
            ? "This invoice has been voided"
            : settled
              ? "Paid in full"
              : `${formatMoney(balanceCents)} outstanding`
        }
      />
      <div className="space-y-3 p-4">
        {error ? <Alert tone="bad">{error}</Alert> : null}
        {notice ? <Alert tone="good">{notice}</Alert> : null}

        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/pdf/invoice/${invoiceId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-4 font-semibold"
          >
            📄 View PDF
          </a>
          <a
            href={`/api/pdf/invoice/${invoiceId}?download=1`}
            className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-4 font-semibold"
          >
            ⬇️ Download
          </a>

          {status === "draft" ? (
            <Button onClick={() => run(() => markInvoiceSent({ invoiceId }))} disabled={pending}>
              Mark as sent
            </Button>
          ) : null}

          {status !== "draft" && status !== "void" && !settled ? (
            <Button variant="success" onClick={() => setPanel(panel === "pay" ? null : "pay")} disabled={pending}>
              Record a payment
            </Button>
          ) : null}

          {canVoid && status !== "void" && payments.length === 0 ? (
            <Button variant="danger" onClick={() => setPanel(panel === "void" ? null : "void")} disabled={pending}>
              Void it
            </Button>
          ) : null}
        </div>

        {panel === "pay" ? (
          <div className="rounded-lg border-2 border-good-600 bg-good-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="How much came in?" htmlFor="payAmount" required
                     hint={`Outstanding: ${formatMoney(balanceCents)}`}>
                <MoneyInput id="payAmount" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              </Field>
              <Field label="When?" htmlFor="paidOn">
                <Input id="paidOn" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <Field label="How?" htmlFor="payMethod">
                <Select id="payMethod" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
              </Field>
              <Field label="Reference on the statement" htmlFor="payRef">
                <Input id="payRef" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPanel(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="success"
                className="flex-1"
                disabled={pending}
                onClick={() => run(() => recordPayment({ invoiceId, amountCents: amount, paidOn, method, reference }))}
              >
                {pending ? "Saving…" : "Record it"}
              </Button>
            </div>
          </div>
        ) : null}

        {panel === "void" ? (
          <div className="rounded-lg border-2 border-bad-600 bg-bad-50 p-3">
            <p className="mb-2 text-sm text-ink-700">
              Voiding keeps the invoice and its number on the record — nothing is deleted. Anything it
              billed (expenses, variations) is released so it can go on a replacement.
            </p>
            <Field label="Why is it being voided?" htmlFor="voidReason" required>
              <Textarea id="voidReason" rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} autoFocus />
            </Field>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPanel(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={pending || voidReason.trim().length < 3}
                onClick={() => run(() => voidInvoice({ invoiceId, reason: voidReason }))}
              >
                {pending ? "Voiding…" : "Void this invoice"}
              </Button>
            </div>
          </div>
        ) : null}

        {payments.length > 0 ? (
          <ul className="divide-y divide-ink-200 border-t border-ink-200 pt-1">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="tabular font-bold text-good-700">{formatMoney(payment.amountCents)}</p>
                  <p className="text-sm text-ink-600">
                    {formatDate(payment.paidOn)} · {METHODS.find((m) => m.value === payment.method)?.label}
                    {payment.reference ? ` · ${payment.reference}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => reversePayment({ paymentId: payment.id }))}
                >
                  Reverse
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
