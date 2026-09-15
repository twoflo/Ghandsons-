"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSupplier } from "@/modules/expenses/actions";
import { Button, Field, Input, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import type { CategoryOption } from "@/modules/expenses/queries";

export type SupplierFormValues = {
  id?: string;
  name: string;
  abn: string;
  email: string;
  phone: string;
  addressLine1: string;
  suburb: string;
  state: string;
  postcode: string;
  accountNumber: string;
  contactName: string;
  paymentTermsDays: number;
  defaultCategoryId: string;
  notes: string;
};

export function SupplierForm({
  initial,
  categories,
}: {
  initial: SupplierFormValues;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    startTransition(async () => {
      const result = await saveSupplier(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      router.push(`/suppliers/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {message ? <Alert tone="bad">{message}</Alert> : null}

      <Card>
        <CardHeader title="Who they are" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="sname" error={errors.name} required className="sm:col-span-2"
                 hint="As you'd say it. Receipts get matched against this and anything we've seen before.">
            <Input id="sname" value={values.name} onChange={(e) => set("name", e.target.value)} required autoFocus={!values.id} />
          </Field>
          <Field label="ABN" htmlFor="sabn" error={errors.abn}
                 hint="Worth adding — it's the surest way a receipt gets matched.">
            <Input id="sabn" value={values.abn} onChange={(e) => set("abn", e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Your account number" htmlFor="sacct">
            <Input id="sacct" value={values.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
          </Field>
          <Field label="Who you deal with" htmlFor="scontact">
            <Input id="scontact" value={values.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label="Phone" htmlFor="sphone">
            <Input id="sphone" type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="semail" className="sm:col-span-2">
            <Input id="semail" type="email" autoCapitalize="none" value={values.email}
                   onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Where they are" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Street" htmlFor="saddr" className="sm:col-span-2">
            <Input id="saddr" value={values.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
          </Field>
          <Field label="Suburb" htmlFor="ssub">
            <Input id="ssub" value={values.suburb} onChange={(e) => set("suburb", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="State" htmlFor="sstate">
              <Input id="sstate" value={values.state} maxLength={3} onChange={(e) => set("state", e.target.value)} />
            </Field>
            <Field label="Postcode" htmlFor="spc">
              <Input id="spc" value={values.postcode} inputMode="numeric" maxLength={4}
                     onChange={(e) => set("postcode", e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="How you buy from them" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Their payment terms" htmlFor="sterms">
            <div className="flex items-center gap-2">
              <Input
                id="sterms"
                type="number"
                min={0}
                max={120}
                value={values.paymentTermsDays}
                onChange={(e) => set("paymentTermsDays", Number.parseInt(e.target.value, 10) || 0)}
                className="tabular text-right"
              />
              <span className="font-semibold text-ink-600">days</span>
            </div>
          </Field>
          <Field label="What you usually buy" htmlFor="scat"
                 hint="Pre-fills the category when a receipt from them comes in.">
            <Select id="scat" value={values.defaultCategoryId} onChange={(e) => set("defaultCategoryId", e.target.value)}>
              <option value="">Not set</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="snotes" className="sm:col-span-2">
            <Textarea id="snotes" rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-20 z-20 flex gap-3 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
        <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="flex-[2]" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save changes" : "Add supplier"}
        </Button>
      </div>
    </form>
  );
}
