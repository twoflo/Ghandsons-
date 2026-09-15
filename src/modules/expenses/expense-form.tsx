"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveExpense } from "./actions";
import { Button, Field, Input, MoneyInput, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import { formatMoney, centsToInput, parseMoneyToCents, exTaxFromInclusive, GST_BP } from "@/lib/money";
import type { SupplierOption, CategoryOption } from "./queries";
import type { ExpenseFormValues } from "./form-values";


const METHODS = [
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "direct_debit", label: "Direct debit" },
  { value: "other", label: "Something else" },
];

/**
 * Entering an expense by hand. The owner types the total off the docket —
 * that's the number he can see — and the GST is worked back out of it at
 * 1/11th, which is what an Australian tax invoice always splits to. He can
 * override it for the odd docket where GST isn't exactly a tenth.
 */
export function ExpenseForm({
  initial,
  suppliers,
  categories,
  jobs,
  receiptUrl,
}: {
  initial: ExpenseFormValues;
  suppliers: SupplierOption[];
  categories: CategoryOption[];
  jobs: Array<{ id: string; jobNumber: string; title: string; clientName: string }>;
  receiptUrl?: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [overrideGst, setOverrideGst] = useState(initial.taxCents !== null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const split = useMemo(() => {
    if (!values.hasGst) return { tax: 0, subtotal: values.totalCents };
    const tax =
      overrideGst && values.taxCents !== null
        ? Math.max(0, Math.min(values.taxCents, values.totalCents))
        : values.totalCents - exTaxFromInclusive(values.totalCents, GST_BP);
    return { tax, subtotal: values.totalCents - tax };
  }, [values.totalCents, values.taxCents, values.hasGst, overrideGst]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    startTransition(async () => {
      const result = await saveExpense({
        id: values.id,
        jobId: values.jobId,
        supplierId: values.supplierId,
        supplierNameRaw: values.supplierNameRaw,
        categoryId: values.categoryId,
        expenseDate: values.expenseDate,
        description: values.description,
        totalCents: String(values.totalCents / 100),
        taxCents: overrideGst && values.taxCents !== null ? String(values.taxCents / 100) : undefined,
        hasGst: values.hasGst,
        isBillable: values.isBillable,
        paymentMethod: values.paymentMethod,
        reference: values.reference,
        notes: values.notes,
        receiptFileId: values.receiptFileId,
        receiptUploadId: values.receiptUploadId,
        source: values.source,
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      router.push(`/expenses/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {message ? <Alert tone="bad">{message}</Alert> : null}

      {receiptUrl ? (
        <Card>
          <CardHeader title="The receipt" subtitle="Kept with this expense forever" />
          <div className="p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={receiptUrl} alt="Photographed receipt" className="mx-auto max-h-80 rounded-lg border border-ink-200" />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="What you spent" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Amount on the receipt" htmlFor="totalCents" error={errors.totalCents} required
                 hint="The total including GST — the big number at the bottom.">
            <MoneyInput
              id="totalCents"
              defaultValue={centsToInput(values.totalCents)}
              onBlur={(e) => set("totalCents", parseMoneyToCents(e.target.value) ?? 0)}
              autoFocus={!values.id}
            />
          </Field>

          <Field label="Date" htmlFor="expenseDate" error={errors.expenseDate} required>
            <Input id="expenseDate" type="date" value={values.expenseDate}
                   onChange={(e) => set("expenseDate", e.target.value)} />
          </Field>

          <div className="rounded-lg bg-ink-100 p-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink-600">Works out as</p>
                <p className="tabular font-bold text-ink-900">
                  {formatMoney(split.subtotal)} + {formatMoney(split.tax)} GST
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="flex min-h-[var(--tap)] items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={values.hasGst}
                         onChange={(e) => set("hasGst", e.target.checked)}
                         className="h-5 w-5 rounded border-2 border-ink-400" />
                  GST on this
                </label>
                {values.hasGst ? (
                  <label className="flex min-h-[var(--tap)] items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={overrideGst}
                           onChange={(e) => setOverrideGst(e.target.checked)}
                           className="h-5 w-5 rounded border-2 border-ink-400" />
                    Type the GST myself
                  </label>
                ) : null}
              </div>
            </div>
            {values.hasGst && overrideGst ? (
              <div className="mt-3 max-w-48">
                <MoneyInput
                  aria-label="GST amount"
                  defaultValue={centsToInput(values.taxCents ?? split.tax)}
                  onBlur={(e) => set("taxCents", parseMoneyToCents(e.target.value) ?? 0)}
                />
              </div>
            ) : null}
          </div>

          <Field label="What was it?" htmlFor="description" error={errors.description} required className="sm:col-span-2"
                 hint="You'll read this in six months trying to remember. Be specific.">
            <Input id="description" value={values.description} onChange={(e) => set("description", e.target.value)}
                   placeholder="Framing timber for the first floor" maxLength={500} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Where it belongs" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Supplier" htmlFor="supplierId" error={errors.supplierId}>
            <Select
              id="supplierId"
              value={values.supplierId}
              onChange={(e) => {
                const supplier = suppliers.find((s) => s.id === e.target.value);
                set("supplierId", e.target.value);
                if (supplier?.defaultCategoryId && !values.categoryId) {
                  set("categoryId", supplier.defaultCategoryId);
                }
              }}
            >
              <option value="">Not recorded</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>

          <Field label="Category" htmlFor="categoryId" error={errors.categoryId} required
                 hint="This decides which budget bucket it hits on the job.">
            <Select
              id="categoryId"
              value={values.categoryId}
              onChange={(e) => {
                const category = categories.find((c) => c.id === e.target.value);
                set("categoryId", e.target.value);
                if (category) set("isBillable", category.defaultBillable);
              }}
              required
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>

          <Field label="Job" htmlFor="jobId" error={errors.jobId} className="sm:col-span-2"
                 hint="No job means it's an overhead — fuel, tools, office. It won't show in job costs.">
            <Select id="jobId" value={values.jobId} onChange={(e) => set("jobId", e.target.value)}>
              <option value="">Overhead — not against a job</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.jobNumber} — {j.title} ({j.clientName})</option>
              ))}
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <label
              className={`flex min-h-[var(--tap)] cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2 ${
                values.isBillable ? "border-good-600 bg-good-50" : "border-ink-300 bg-white"
              }`}
            >
              <input type="checkbox" checked={values.isBillable}
                     onChange={(e) => set("isBillable", e.target.checked)}
                     className="h-5 w-5 rounded border-2 border-ink-400" />
              <span>
                <span className="font-semibold text-ink-900">Charge this on to the client</span>
                <span className="block text-sm text-ink-600">
                  It&apos;ll appear when you raise the next claim on the job.
                </span>
              </span>
            </label>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Extra detail" subtitle="Optional" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Paid with" htmlFor="paymentMethod">
            <Select id="paymentMethod" value={values.paymentMethod}
                    onChange={(e) => set("paymentMethod", e.target.value)}>
              {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Docket or invoice number" htmlFor="reference">
            <Input id="reference" value={values.reference} onChange={(e) => set("reference", e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-20 z-20 flex gap-3 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
        <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="flex-[2]" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save changes" : "Save expense"}
        </Button>
      </div>
    </form>
  );
}
