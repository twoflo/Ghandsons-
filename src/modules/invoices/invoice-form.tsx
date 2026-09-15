"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveInvoice } from "./actions";
import {
  Button, Field, Input, MoneyInput, Select, Textarea, Alert, Card, CardHeader,
} from "@/components/ui";
import { formatMoney, centsToInput, parseMoneyToCents, taxOn, lineTotal } from "@/lib/money";
import { addDaysIso } from "@/lib/dates";
import type { ClientOption } from "@/modules/jobs/job-form";
import { blankInvoiceLine, type InvoiceEditorLine } from "./editor-line";

export type InvoiceFormValues = {
  id?: string;
  clientId: string;
  jobId: string;
  type: "standard" | "deposit" | "progress" | "final";
  issueDate: string;
  paymentTermsDays: number;
  reference: string;
  notes: string;
  terms: string;
  lines: InvoiceEditorLine[];
};

const TYPES = [
  { value: "standard", label: "Standard invoice" },
  { value: "deposit", label: "Deposit" },
  { value: "progress", label: "Progress claim" },
  { value: "final", label: "Final invoice" },
];

export function InvoiceForm({
  initial,
  clients,
  jobs,
  taxRates,
}: {
  initial: InvoiceFormValues;
  clients: ClientOption[];
  jobs: Array<{ id: string; jobNumber: string; title: string; clientId: string }>;
  taxRates: Array<{ id: string; name: string; rateBp: number }>;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof InvoiceFormValues>(key: K, value: InvoiceFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of values.lines) {
      if (line.isHeading) continue;
      const sub = lineTotal(line.quantity, line.unitPriceCents);
      subtotal += sub;
      tax += taxOn(sub, line.taxRateBp);
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [values.lines]);

  const clientJobs = jobs.filter((j) => !values.clientId || j.clientId === values.clientId);

  function updateLine(key: string, patch: Partial<InvoiceEditorLine>) {
    set("lines", values.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);

    if (values.lines.filter((l) => !l.isHeading).length === 0) {
      setMessage("Add at least one line with an amount on it.");
      return;
    }

    startTransition(async () => {
      const result = await saveInvoice({
        id: values.id,
        clientId: values.clientId,
        jobId: values.jobId,
        type: values.type,
        issueDate: values.issueDate,
        paymentTermsDays: values.paymentTermsDays,
        reference: values.reference,
        notes: values.notes,
        terms: values.terms,
        lines: values.lines.map((l) => ({
          id: l.id,
          isHeading: l.isHeading,
          sourceType: l.sourceType,
          sourceId: l.sourceId,
          description: l.description || "Item",
          quantity: l.quantity,
          unit: l.unit,
          unitPriceCents: String(l.unitPriceCents / 100),
          taxRateId: l.taxRateId,
        })),
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      router.push(`/invoices/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {message ? <Alert tone="bad">{message}</Alert> : null}

      <Card>
        <CardHeader title="Who it's for" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Client" htmlFor="clientId" error={errors.clientId} required>
            <Select id="clientId" value={values.clientId}
                    onChange={(e) => { set("clientId", e.target.value); set("jobId", ""); }} required>
              <option value="">Choose a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>

          <Field label="Against which job?" htmlFor="jobId" error={errors.jobId}
                 hint="Linking it means the money shows up on the job's numbers.">
            <Select id="jobId" value={values.jobId} onChange={(e) => set("jobId", e.target.value)}>
              <option value="">Not linked to a job</option>
              {clientJobs.map((j) => (
                <option key={j.id} value={j.id}>{j.jobNumber} — {j.title}</option>
              ))}
            </Select>
          </Field>

          <Field label="What kind?" htmlFor="type" error={errors.type}>
            <Select id="type" value={values.type}
                    onChange={(e) => set("type", e.target.value as InvoiceFormValues["type"])}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>

          <Field label="Reference" htmlFor="reference" error={errors.reference}
                 hint="Their PO number, if they need one on it.">
            <Input id="reference" value={values.reference} onChange={(e) => set("reference", e.target.value)} />
          </Field>

          <Field label="Issue date" htmlFor="issueDate" error={errors.issueDate}>
            <Input id="issueDate" type="date" value={values.issueDate}
                   onChange={(e) => set("issueDate", e.target.value)} />
          </Field>

          <Field
            label="Payment terms"
            htmlFor="paymentTermsDays"
            error={errors.paymentTermsDays}
            hint={values.issueDate ? `Due ${addDaysIso(values.issueDate, values.paymentTermsDays)}` : undefined}
          >
            <div className="flex items-center gap-2">
              <Input
                id="paymentTermsDays"
                type="number"
                inputMode="numeric"
                min={0}
                max={120}
                value={values.paymentTermsDays}
                onChange={(e) => set("paymentTermsDays", Number.parseInt(e.target.value, 10) || 0)}
                className="tabular text-right"
              />
              <span className="font-semibold text-ink-600">days</span>
            </div>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Lines" subtitle="What the client is being charged for" />
        <div className="space-y-3 p-4">
          {values.lines.map((line, index) =>
            line.isHeading ? (
              <div key={line.key} className="flex items-center gap-2 rounded-lg bg-ink-200 p-2">
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  className="font-bold"
                  aria-label={`Section heading ${index + 1}`}
                />
                <RemoveButton onClick={() => set("lines", values.lines.filter((l) => l.key !== line.key))} />
              </div>
            ) : (
              <div key={line.key} className="rounded-lg border-2 border-ink-200 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                      placeholder="What are they paying for?"
                      aria-label={`Line ${index + 1} description`}
                    />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <label>
                        <span className="sr-only">Quantity</span>
                        <Input
                          value={line.quantity}
                          onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                          inputMode="decimal"
                          className="tabular text-right"
                          aria-label={`Line ${index + 1} quantity`}
                        />
                      </label>
                      <label>
                        <span className="sr-only">Unit</span>
                        <Input
                          value={line.unit}
                          onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                          aria-label={`Line ${index + 1} unit`}
                        />
                      </label>
                      <label>
                        <span className="sr-only">Unit price</span>
                        <MoneyInput
                          defaultValue={centsToInput(line.unitPriceCents)}
                          onBlur={(e) =>
                            updateLine(line.key, { unitPriceCents: parseMoneyToCents(e.target.value) ?? 0 })
                          }
                          aria-label={`Line ${index + 1} unit price`}
                        />
                      </label>
                      <label>
                        <span className="sr-only">GST</span>
                        <Select
                          value={line.taxRateId ?? ""}
                          onChange={(e) => {
                            const rate = taxRates.find((r) => r.id === e.target.value);
                            updateLine(line.key, {
                              taxRateId: e.target.value || null,
                              taxRateBp: rate?.rateBp ?? 0,
                            });
                          }}
                          aria-label={`Line ${index + 1} GST`}
                        >
                          {taxRates.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </Select>
                      </label>
                    </div>
                    <p className="text-right tabular font-bold text-ink-900">
                      {formatMoney(lineTotal(line.quantity, line.unitPriceCents))}
                    </p>
                  </div>
                  <RemoveButton onClick={() => set("lines", values.lines.filter((l) => l.key !== line.key))} />
                </div>
              </div>
            ),
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const rate = taxRates.find((r) => r.rateBp > 0) ?? taxRates[0];
                set("lines", [...values.lines, blankInvoiceLine(rate?.id ?? null, rate?.rateBp ?? 0)]);
              }}
            >
              + Add a line
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const rate = taxRates[0];
                set("lines", [
                  ...values.lines,
                  { ...blankInvoiceLine(rate?.id ?? null, 0), isHeading: true, description: "New section" },
                ]);
              }}
            >
              + Section heading
            </Button>
          </div>

          <dl className="ml-auto max-w-xs space-y-1.5 border-t-2 border-ink-300 pt-3">
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-ink-700">Subtotal</dt>
              <dd className="tabular font-semibold">{formatMoney(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-ink-700">GST</dt>
              <dd className="tabular font-semibold">{formatMoney(totals.tax)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t-2 border-ink-300 pt-1.5">
              <dt className="font-bold">Total</dt>
              <dd className="tabular text-lg font-black">{formatMoney(totals.total)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card>
        <CardHeader title="Notes & terms" subtitle="Both print on the invoice" />
        <div className="grid gap-4 p-4">
          <Field label="Notes" htmlFor="notes" error={errors.notes}>
            <Textarea id="notes" rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <Field label="Terms" htmlFor="terms" error={errors.terms}>
            <Textarea id="terms" rows={3} value={values.terms} onChange={(e) => set("terms", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-20 z-20 flex gap-3 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
        <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="flex-[2]" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save invoice" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove line"
      className="h-9 w-9 shrink-0 rounded border border-bad-500/50 text-bad-700 hover:bg-bad-50"
    >
      ✕
    </button>
  );
}
