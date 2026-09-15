"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveClient } from "./actions";
import { Button, Field, Input, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";

export type ClientFormValues = {
  id?: string;
  name: string;
  type: "individual" | "company";
  abn: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  suburb: string;
  state: string;
  postcode: string;
  paymentTermsDays: string;
  onHold: boolean;
  notes: string;
  source: string;
};

const STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"];

export function ClientForm({
  initial,
  defaultTermsDays,
}: {
  initial: ClientFormValues;
  defaultTermsDays: number;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    startTransition(async () => {
      const result = await saveClient({
        ...values,
        paymentTermsDays: values.paymentTermsDays === "" ? undefined : values.paymentTermsDays,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      router.push(`/clients/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {message ? <Alert tone="bad">{message}</Alert> : null}

      <Card>
        <CardHeader title="Who they are" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" error={errors.name} required className="sm:col-span-2"
                 hint="For a couple, put both names — “Sarah & Tom Whitfield”.">
            <Input id="name" value={values.name} onChange={(e) => set("name", e.target.value)}
                   required autoFocus={!values.id} maxLength={200} />
          </Field>

          <Field label="Type" htmlFor="type" error={errors.type}>
            <Select id="type" value={values.type}
                    onChange={(e) => set("type", e.target.value as "individual" | "company")}>
              <option value="individual">A person or household</option>
              <option value="company">A business</option>
            </Select>
          </Field>

          {values.type === "company" ? (
            <Field label="ABN" htmlFor="abn" error={errors.abn}>
              <Input id="abn" value={values.abn} onChange={(e) => set("abn", e.target.value)}
                     inputMode="numeric" placeholder="63 142 887 509" maxLength={20} />
            </Field>
          ) : (
            <Field label="How did they find you?" htmlFor="source" error={errors.source}>
              <Input id="source" value={values.source} onChange={(e) => set("source", e.target.value)}
                     placeholder="Referral, signage, website…" maxLength={120} />
            </Field>
          )}

          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input id="phone" type="tel" inputMode="tel" value={values.phone}
                   onChange={(e) => set("phone", e.target.value)} placeholder="0400 000 000" />
          </Field>

          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" inputMode="email" autoCapitalize="none" value={values.email}
                   onChange={(e) => set("email", e.target.value)} placeholder="them@example.com.au" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Where the invoices go" subtitle="Job sites are separate — add those on the client's page." />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Street" htmlFor="addressLine1" error={errors.addressLine1} className="sm:col-span-2">
            <Input id="addressLine1" value={values.addressLine1}
                   onChange={(e) => set("addressLine1", e.target.value)} autoComplete="address-line1" />
          </Field>
          <Field label="Unit / level" htmlFor="addressLine2" error={errors.addressLine2}>
            <Input id="addressLine2" value={values.addressLine2}
                   onChange={(e) => set("addressLine2", e.target.value)} autoComplete="address-line2" />
          </Field>
          <Field label="Suburb" htmlFor="suburb" error={errors.suburb}>
            <Input id="suburb" value={values.suburb} onChange={(e) => set("suburb", e.target.value)}
                   autoComplete="address-level2" />
          </Field>
          <Field label="State" htmlFor="state" error={errors.state}>
            <Select id="state" value={values.state} onChange={(e) => set("state", e.target.value)}>
              <option value="">—</option>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Postcode" htmlFor="postcode" error={errors.postcode}>
            <Input id="postcode" value={values.postcode} inputMode="numeric" maxLength={4}
                   onChange={(e) => set("postcode", e.target.value)} autoComplete="postal-code" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Terms & notes" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Payment terms" htmlFor="paymentTermsDays" error={errors.paymentTermsDays}
                 hint={`Leave blank to use the business default of ${defaultTermsDays} days.`}>
            <Input id="paymentTermsDays" type="number" inputMode="numeric" min={0} max={120}
                   value={values.paymentTermsDays}
                   onChange={(e) => set("paymentTermsDays", e.target.value)}
                   placeholder={String(defaultTermsDays)} />
          </Field>

          <div className="flex items-end">
            <label className="flex min-h-[var(--tap)] items-center gap-2.5 font-semibold text-ink-800">
              <input type="checkbox" checked={values.onHold}
                     onChange={(e) => set("onHold", e.target.checked)}
                     className="h-5 w-5 rounded border-2 border-ink-400" />
              Put this client on hold
            </label>
          </div>

          <Field label="Notes" htmlFor="notes" error={errors.notes} className="sm:col-span-2"
                 hint="Anything worth remembering next time you deal with them.">
            <Textarea id="notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-20 z-20 flex gap-3 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
        <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="flex-[2]" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save changes" : "Add client"}
        </Button>
      </div>
    </form>
  );
}
