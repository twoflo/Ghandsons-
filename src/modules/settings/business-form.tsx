"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBusinessSettings } from "./actions";
import { Button, Field, Input, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function BusinessForm({
  initial,
  readOnly,
}: {
  initial: Record<string, string | number | null>;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setErrors({});
    setMessage(null);
    setNotice(null);
    startTransition(async () => {
      const result = await saveBusinessSettings({
        ...data,
        defaultMarkupBp: Math.round((Number.parseFloat(String(data.defaultMarkupPct ?? "20")) || 0) * 100),
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      setNotice(result.message ?? "Saved.");
      router.refresh();
    });
  }

  const v = (key: string) => String(initial[key] ?? "");

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {message ? <Alert tone="bad">{message}</Alert> : null}
      {notice ? <Alert tone="good">{notice}</Alert> : null}
      {readOnly ? (
        <Alert tone="info">Only the owner can change these. You can see them but not edit.</Alert>
      ) : null}

      <fieldset disabled={readOnly || pending} className="space-y-5">
        <Card>
          <CardHeader title="Who you are" subtitle="This is what prints on every quote and invoice" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Trading name" htmlFor="tradingName" error={errors.tradingName} required className="sm:col-span-2">
              <Input id="tradingName" name="tradingName" defaultValue={v("tradingName")} required />
            </Field>
            <Field label="Legal name" htmlFor="legalName" hint="If it's different from the trading name.">
              <Input id="legalName" name="legalName" defaultValue={v("legalName")} />
            </Field>
            <Field label="ABN" htmlFor="abn" error={errors.abn}
                   hint="Required on a tax invoice. Without it the client can withhold 47%.">
              <Input id="abn" name="abn" defaultValue={v("abn")} inputMode="numeric" />
            </Field>
            <Field label="ACN" htmlFor="acn">
              <Input id="acn" name="acn" defaultValue={v("acn")} inputMode="numeric" />
            </Field>
            <Field label="Builder's licence" htmlFor="licenceNumber" hint="QBCC number, or your state's equivalent.">
              <Input id="licenceNumber" name="licenceNumber" defaultValue={v("licenceNumber")} />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={v("email")} autoCapitalize="none" />
            </Field>
            <Field label="Phone" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" defaultValue={v("phone")} />
            </Field>
            <Field label="Website" htmlFor="website">
              <Input id="website" name="website" defaultValue={v("website")} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Where you are" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Street" htmlFor="addressLine1" className="sm:col-span-2">
              <Input id="addressLine1" name="addressLine1" defaultValue={v("addressLine1")} />
            </Field>
            <Field label="Suburb" htmlFor="suburb">
              <Input id="suburb" name="suburb" defaultValue={v("suburb")} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="State" htmlFor="state">
                <Input id="state" name="state" defaultValue={v("state")} maxLength={3} />
              </Field>
              <Field label="Postcode" htmlFor="postcode">
                <Input id="postcode" name="postcode" defaultValue={v("postcode")} inputMode="numeric" maxLength={4} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="How you work" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Financial year starts" htmlFor="financialYearStartMonth"
                   hint="July in Australia. Drives the reports and the BAS quarters.">
              <Select
                id="financialYearStartMonth"
                name="financialYearStartMonth"
                defaultValue={String(initial.financialYearStartMonth ?? 7)}
              >
                {MONTHS.map((month, i) => (
                  <option key={month} value={i + 1}>{month}</option>
                ))}
              </Select>
            </Field>
            <Field label="Timezone" htmlFor="timezone">
              <Input id="timezone" name="timezone" defaultValue={v("timezone")} />
            </Field>
            <Field label="Default payment terms" htmlFor="defaultPaymentTermsDays">
              <div className="flex items-center gap-2">
                <Input
                  id="defaultPaymentTermsDays"
                  name="defaultPaymentTermsDays"
                  type="number"
                  min={0}
                  max={120}
                  defaultValue={String(initial.defaultPaymentTermsDays ?? 14)}
                  className="tabular text-right"
                />
                <span className="font-semibold text-ink-600">days</span>
              </div>
            </Field>
            <Field label="Default markup on quotes" htmlFor="defaultMarkupPct">
              <div className="flex items-center gap-2">
                <Input
                  id="defaultMarkupPct"
                  name="defaultMarkupPct"
                  type="number"
                  step="0.5"
                  min={0}
                  defaultValue={String((Number(initial.defaultMarkupBp ?? 2000)) / 100)}
                  className="tabular text-right"
                />
                <span className="font-semibold text-ink-600">%</span>
              </div>
            </Field>
            <Field label="Quotes stay valid for" htmlFor="quoteValidDays">
              <div className="flex items-center gap-2">
                <Input
                  id="quoteValidDays"
                  name="quoteValidDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={String(initial.quoteValidDays ?? 30)}
                  className="tabular text-right"
                />
                <span className="font-semibold text-ink-600">days</span>
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="How clients pay you" subtitle="Printed on every invoice" />
          <div className="grid gap-4 p-4 sm:grid-cols-3">
            <Field label="Account name" htmlFor="bankAccountName" className="sm:col-span-3">
              <Input id="bankAccountName" name="bankAccountName" defaultValue={v("bankAccountName")} />
            </Field>
            <Field label="BSB" htmlFor="bankBsb">
              <Input id="bankBsb" name="bankBsb" defaultValue={v("bankBsb")} inputMode="numeric" />
            </Field>
            <Field label="Account number" htmlFor="bankAccountNumber" className="sm:col-span-2">
              <Input id="bankAccountNumber" name="bankAccountNumber" defaultValue={v("bankAccountNumber")} inputMode="numeric" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Standard wording" />
          <div className="grid gap-4 p-4">
            <Field label="Invoice footer" htmlFor="invoiceFooter"
                   hint="Payment instructions, late fees, anything that goes at the bottom.">
              <Textarea id="invoiceFooter" name="invoiceFooter" rows={2} defaultValue={v("invoiceFooter")} />
            </Field>
            <Field label="Quote terms" htmlFor="quoteTerms"
                   hint="The paragraph that goes on every quote. Deposit, progress claims, what's excluded.">
              <Textarea id="quoteTerms" name="quoteTerms" rows={6} defaultValue={v("quoteTerms")} />
            </Field>
          </div>
        </Card>

        {!readOnly ? (
          <div className="sticky bottom-20 z-20 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
