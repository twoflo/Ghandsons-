"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePurchaseOrder } from "./actions";
import { Button, Field, Input, MoneyInput, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import { formatMoney, centsToInput, parseMoneyToCents, taxOn, lineTotal } from "@/lib/money";
import type { PriceBookEntry } from "@/modules/quotes/queries";
import type { PoEditorLine } from "./po-line";

export type PoPoEditorLine = {
  key: string;
  id?: string;
  description: string;
  quantity: string;
  unit: string;
  unitCostCents: number;
  taxRateId: string | null;
  taxRateBp: number;
};

export function PurchaseOrderForm({
  initial,
  suppliers,
  jobs,
  priceBook,
  taxRates,
}: {
  initial: {
    id?: string;
    supplierId: string;
    jobId: string;
    orderDate: string;
    expectedDate: string;
    deliverTo: string;
    notes: string;
    lines: PoEditorLine[];
  };
  suppliers: Array<{ id: string; name: string }>;
  jobs: Array<{ id: string; jobNumber: string; title: string }>;
  priceBook: PriceBookEntry[];
  taxRates: Array<{ id: string; name: string; rateBp: number }>;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const set = <K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const line of values.lines) {
      const sub = lineTotal(line.quantity, line.unitCostCents);
      subtotal += sub;
      tax += taxOn(sub, line.taxRateBp);
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [values.lines]);

  function updateLine(key: string, patch: Partial<PoEditorLine>) {
    set("lines", values.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const rate = taxRates.find((r) => r.rateBp > 0) ?? taxRates[0];
    set("lines", [
      ...values.lines,
      {
        key: `new-${Math.random().toString(36).slice(2)}`,
        description: "",
        quantity: "1",
        unit: "ea",
        unitCostCents: 0,
        taxRateId: rate?.id ?? null,
        taxRateBp: rate?.rateBp ?? 0,
      },
    ]);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    startTransition(async () => {
      const result = await savePurchaseOrder({
        id: values.id,
        supplierId: values.supplierId,
        jobId: values.jobId,
        orderDate: values.orderDate,
        expectedDate: values.expectedDate,
        deliverTo: values.deliverTo,
        notes: values.notes,
        lines: values.lines.map((l) => ({
          id: l.id,
          description: l.description || "Item",
          quantity: l.quantity,
          unit: l.unit,
          unitCostCents: String(l.unitCostCents / 100),
          taxRateId: l.taxRateId,
        })),
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      router.push(`/purchase-orders/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {message ? <Alert tone="bad">{message}</Alert> : null}

      <Card>
        <CardHeader title="Who and when" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Supplier" htmlFor="posupplier" error={errors.supplierId} required>
            <Select id="posupplier" value={values.supplierId} onChange={(e) => set("supplierId", e.target.value)} required>
              <option value="">Choose a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="For which job?" htmlFor="pojob" error={errors.jobId}
                 hint="Linking it means it shows as committed cost on the job.">
            <Select id="pojob" value={values.jobId} onChange={(e) => set("jobId", e.target.value)}>
              <option value="">Not against a job</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.jobNumber} — {j.title}</option>)}
            </Select>
          </Field>
          <Field label="Order date" htmlFor="poorder">
            <Input id="poorder" type="date" value={values.orderDate} onChange={(e) => set("orderDate", e.target.value)} />
          </Field>
          <Field label="Wanted by" htmlFor="poexpected">
            <Input id="poexpected" type="date" value={values.expectedDate}
                   onChange={(e) => set("expectedDate", e.target.value)} />
          </Field>
          <Field label="Deliver to" htmlFor="podeliver" className="sm:col-span-2"
                 hint="Site address, or the yard.">
            <Input id="podeliver" value={values.deliverTo} onChange={(e) => set("deliverTo", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="What you're ordering" />
        <div className="space-y-3 p-4">
          {values.lines.map((line, index) => (
            <div key={line.key} className="rounded-lg border-2 border-ink-200 p-3">
              <div className="flex gap-2">
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(line.key, { description: e.target.value })}
                  placeholder="What is it?"
                  aria-label={`Line ${index + 1} description`}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPickerFor(pickerFor === line.key ? null : line.key)}
                  title="Pick from the price book"
                >
                  📖
                </Button>
                <button
                  type="button"
                  onClick={() => set("lines", values.lines.filter((l) => l.key !== line.key))}
                  className="h-11 w-11 shrink-0 rounded border border-bad-500/50 text-bad-700"
                  aria-label="Remove line"
                >
                  ✕
                </button>
              </div>

              {pickerFor === line.key ? (
                <ul className="mt-2 max-h-56 overflow-y-auto rounded border-2 border-info-500 bg-info-50 p-1">
                  {priceBook.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          updateLine(line.key, {
                            description: item.name,
                            unit: item.unit,
                            unitCostCents: item.unitCostCents,
                          });
                          setPickerFor(null);
                        }}
                        className="flex w-full min-h-[var(--tap)] items-center justify-between gap-3 rounded px-2 text-left hover:bg-white"
                      >
                        <span className="truncate">{item.name}</span>
                        <span className="tabular shrink-0 text-sm font-bold">
                          {formatMoney(item.unitCostCents)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                  <span className="sr-only">Cost each</span>
                  <MoneyInput
                    defaultValue={centsToInput(line.unitCostCents)}
                    onBlur={(e) => updateLine(line.key, { unitCostCents: parseMoneyToCents(e.target.value) ?? 0 })}
                    aria-label={`Line ${index + 1} cost each`}
                  />
                </label>
                <p className="self-center text-right tabular font-bold">
                  {formatMoney(lineTotal(line.quantity, line.unitCostCents))}
                </p>
              </div>
            </div>
          ))}

          <Button type="button" variant="secondary" onClick={addLine}>+ Add a line</Button>

          <dl className="ml-auto max-w-xs space-y-1.5 border-t-2 border-ink-300 pt-3">
            <div className="flex justify-between gap-4">
              <dt className="font-semibold text-ink-700">Ex GST</dt>
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
        <CardHeader title="Notes for the supplier" />
        <div className="p-4">
          <Textarea value={values.notes} rows={2} aria-label="Notes"
                    onChange={(e) => set("notes", e.target.value)} />
        </div>
      </Card>

      <div className="sticky bottom-20 z-20 flex gap-3 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
        <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="flex-[2]" disabled={pending || values.lines.length === 0}>
          {pending ? "Saving…" : values.id ? "Save order" : "Raise the order"}
        </Button>
      </div>
    </form>
  );
}
