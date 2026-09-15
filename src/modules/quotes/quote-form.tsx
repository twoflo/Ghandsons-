"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveQuote } from "./actions";
import { LineEditor } from "./line-editor";
import { newLine, type EditorLine } from "./editor-line";
import type { PriceBookEntry } from "./queries";
import { Button, Field, Input, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import type { ClientOption, SiteOption } from "@/modules/jobs/job-form";

export type QuoteFormValues = {
  id?: string;
  clientId: string;
  siteId: string;
  jobId: string;
  title: string;
  issueDate: string;
  validUntil: string;
  globalMarkupBp: number;
  scopeOfWork: string;
  exclusions: string;
  terms: string;
  internalNotes: string;
  lines: EditorLine[];
};

export function QuoteForm({
  initial,
  clients,
  sites,
  jobs,
  priceBook,
  taxRates,
  showCost,
}: {
  initial: QuoteFormValues;
  clients: ClientOption[];
  sites: SiteOption[];
  jobs: Array<{ id: string; jobNumber: string; title: string }>;
  priceBook: PriceBookEntry[];
  taxRates: Array<{ id: string; name: string; rateBp: number }>;
  showCost: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof QuoteFormValues>(key: K, value: QuoteFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const clientSites = sites.filter((s) => s.clientId === values.clientId);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);

    if (values.lines.filter((l) => !l.isHeading).length === 0) {
      setMessage("Add at least one priced line before saving.");
      return;
    }

    startTransition(async () => {
      const result = await saveQuote({
        id: values.id,
        clientId: values.clientId,
        siteId: values.siteId,
        jobId: values.jobId,
        title: values.title,
        issueDate: values.issueDate,
        validUntil: values.validUntil,
        globalMarkupBp: values.globalMarkupBp,
        scopeOfWork: values.scopeOfWork,
        exclusions: values.exclusions,
        terms: values.terms,
        internalNotes: values.internalNotes,
        lines: values.lines.map((l) => ({
          id: l.id,
          isHeading: l.isHeading ?? false,
          kind: l.kind,
          description: l.description || (l.isHeading ? "Section" : "Item"),
          quantity: l.quantity,
          unit: l.unit,
          unitCostCents: String(l.unitCostCents / 100),
          markupBp: l.markupBp,
          taxRateId: l.taxRateId ?? null,
          priceBookItemId: l.priceBookItemId ?? null,
          notes: l.notes ?? undefined,
        })),
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      router.push(`/quotes/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {message ? <Alert tone="bad">{message}</Alert> : null}

      <Card>
        <CardHeader title="Who and what" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Quote title" htmlFor="title" error={errors.title} required className="sm:col-span-2"
                 hint="This is the heading on the PDF the client reads.">
            <Input id="title" value={values.title} onChange={(e) => set("title", e.target.value)} required autoFocus={!values.id} />
          </Field>

          <Field label="Client" htmlFor="clientId" error={errors.clientId} required>
            <Select id="clientId" value={values.clientId}
                    onChange={(e) => { set("clientId", e.target.value); set("siteId", ""); }} required>
              <option value="">Choose a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>

          <Field label="Site" htmlFor="siteId" error={errors.siteId}>
            <Select id="siteId" value={values.siteId} onChange={(e) => set("siteId", e.target.value)}
                    disabled={!values.clientId}>
              <option value="">{values.clientId ? "Choose a site…" : "Pick a client first"}</option>
              {clientSites.map((s) => (
                <option key={s.id} value={s.id}>{s.label}{s.suburb ? ` — ${s.suburb}` : ""}</option>
              ))}
            </Select>
          </Field>

          <Field label="Date" htmlFor="issueDate" error={errors.issueDate}>
            <Input id="issueDate" type="date" value={values.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
          </Field>

          <Field label="Price holds until" htmlFor="validUntil" error={errors.validUntil}>
            <Input id="validUntil" type="date" value={values.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
          </Field>

          <Field label="Attach to an existing job" htmlFor="jobId" error={errors.jobId}
                 hint="Leave blank — accepting the quote can create the job for you.">
            <Select id="jobId" value={values.jobId} onChange={(e) => set("jobId", e.target.value)}>
              <option value="">Not linked to a job yet</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.jobNumber} — {j.title}</option>)}
            </Select>
          </Field>

          {showCost ? (
            <Field label="Markup across the quote" htmlFor="globalMarkupBp" error={errors.globalMarkupBp}
                   hint="Any line without its own markup uses this.">
              <div className="flex items-center gap-2">
                <Input
                  id="globalMarkupBp"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={0}
                  value={values.globalMarkupBp / 100}
                  onChange={(e) => set("globalMarkupBp", Math.round((Number.parseFloat(e.target.value) || 0) * 100))}
                  className="tabular text-right"
                />
                <span className="font-bold text-ink-600">%</span>
              </div>
            </Field>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="The pricing"
          subtitle={showCost ? "Enter what it costs you; the client's price follows from the markup." : undefined}
        />
        <div className="p-4">
          <LineEditor
            lines={values.lines}
            onChange={(lines) => set("lines", lines)}
            globalMarkupBp={values.globalMarkupBp}
            priceBook={priceBook}
            taxRates={taxRates}
            showCost={showCost}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="What the client reads" />
        <div className="space-y-4 p-4">
          <Field label="Scope of work" htmlFor="scopeOfWork" error={errors.scopeOfWork}
                 hint="Plain words. What you'll do, in order.">
            <Textarea id="scopeOfWork" rows={6} value={values.scopeOfWork}
                      onChange={(e) => set("scopeOfWork", e.target.value)} />
          </Field>
          <Field label="What's not included" htmlFor="exclusions" error={errors.exclusions}
                 hint="The most useful paragraph in the whole quote. Be specific.">
            <Textarea id="exclusions" rows={4} value={values.exclusions}
                      onChange={(e) => set("exclusions", e.target.value)} />
          </Field>
          <Field label="Terms" htmlFor="terms" error={errors.terms}>
            <Textarea id="terms" rows={4} value={values.terms} onChange={(e) => set("terms", e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Internal notes" subtitle="Never printed on the quote" />
        <div className="p-4">
          <Textarea value={values.internalNotes} rows={3} aria-label="Internal notes"
                    onChange={(e) => set("internalNotes", e.target.value)} />
        </div>
      </Card>

      <div className="sticky bottom-20 z-20 flex gap-3 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
        <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="flex-[2]" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save quote" : "Create quote"}
        </Button>
      </div>
    </form>
  );
}
