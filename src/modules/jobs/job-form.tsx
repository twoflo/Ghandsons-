"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveJob, setJobCrew } from "./actions";
import { Button, Field, Input, MoneyInput, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import { formatMoney, centsToInput, parseMoneyToCents } from "@/lib/money";
import { JOB_STATUS, JOB_STATUS_FLOW } from "@/lib/status";

export type ClientOption = { id: string; name: string };
export type SiteOption = { id: string; clientId: string; label: string; suburb: string | null };
export type TypeOption = { id: string; name: string };
export type CrewOption = { id: string; fullName: string; trade: string | null };

export type JobFormValues = {
  id?: string;
  title: string;
  clientId: string;
  siteId: string;
  jobTypeId: string;
  status: string;
  description: string;
  notes: string;
  leadSource: string;
  startDate: string;
  endDate: string;
  isPriority: boolean;
  contractValueCents: number;
  budgetLabourCents: number;
  budgetMaterialCents: number;
  budgetSubcontractorCents: number;
  budgetPlantCents: number;
  budgetOtherCents: number;
  crewIds: string[];
};

const BUDGET_FIELDS = [
  { key: "budgetLabourCents", label: "Labour" },
  { key: "budgetMaterialCents", label: "Materials" },
  { key: "budgetSubcontractorCents", label: "Subcontractors" },
  { key: "budgetPlantCents", label: "Plant & hire" },
  { key: "budgetOtherCents", label: "Other" },
] as const;

export function JobForm({
  initial,
  clients,
  sites,
  jobTypes,
  crew,
}: {
  initial: JobFormValues;
  clients: ClientOption[];
  sites: SiteOption[];
  jobTypes: TypeOption[];
  crew: CrewOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof JobFormValues>(key: K, value: JobFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const clientSites = useMemo(
    () => sites.filter((s) => s.clientId === values.clientId),
    [sites, values.clientId],
  );

  const budgetTotal = BUDGET_FIELDS.reduce((a, f) => a + (values[f.key] || 0), 0);
  const expectedMargin =
    values.contractValueCents > 0
      ? Math.round(((values.contractValueCents - budgetTotal) / values.contractValueCents) * 100)
      : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);

    startTransition(async () => {
      const result = await saveJob({
        id: values.id,
        title: values.title,
        clientId: values.clientId,
        siteId: values.siteId,
        jobTypeId: values.jobTypeId,
        status: values.status,
        description: values.description,
        notes: values.notes,
        leadSource: values.leadSource,
        startDate: values.startDate,
        endDate: values.endDate,
        isPriority: values.isPriority,
        contractValueCents: String(values.contractValueCents / 100),
        budgetLabourCents: String(values.budgetLabourCents / 100),
        budgetMaterialCents: String(values.budgetMaterialCents / 100),
        budgetSubcontractorCents: String(values.budgetSubcontractorCents / 100),
        budgetPlantCents: String(values.budgetPlantCents / 100),
        budgetOtherCents: String(values.budgetOtherCents / 100),
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }

      await setJobCrew({ jobId: result.data.id, userIds: values.crewIds });
      router.push(`/jobs/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {message ? <Alert tone="bad">{message}</Alert> : null}

      <Card>
        <CardHeader title="The job" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="What is it?" htmlFor="title" error={errors.title} required className="sm:col-span-2"
                 hint="Something you'll recognise in a list — “Kitchen reno” beats “Job for Sarah”.">
            <Input id="title" value={values.title} onChange={(e) => set("title", e.target.value)}
                   required maxLength={200} autoFocus={!values.id} />
          </Field>

          <Field label="Client" htmlFor="clientId" error={errors.clientId} required>
            <Select
              id="clientId"
              value={values.clientId}
              onChange={(e) => {
                set("clientId", e.target.value);
                set("siteId", "");
              }}
              required
            >
              <option value="">Choose a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Site"
            htmlFor="siteId"
            error={errors.siteId}
            hint={
              values.clientId && clientSites.length === 0
                ? "This client has no sites saved yet. Add one from their page."
                : undefined
            }
          >
            <Select id="siteId" value={values.siteId} onChange={(e) => set("siteId", e.target.value)}
                    disabled={!values.clientId}>
              <option value="">{values.clientId ? "Choose a site…" : "Pick a client first"}</option>
              {clientSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}{s.suburb ? ` — ${s.suburb}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Type of work" htmlFor="jobTypeId" error={errors.jobTypeId}>
            <Select id="jobTypeId" value={values.jobTypeId} onChange={(e) => set("jobTypeId", e.target.value)}>
              <option value="">Not set</option>
              {jobTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Stage" htmlFor="status" error={errors.status}
                 hint={JOB_STATUS[values.status as keyof typeof JOB_STATUS]?.hint}>
            <Select id="status" value={values.status} onChange={(e) => set("status", e.target.value)}
                    disabled={Boolean(values.id)}>
              {JOB_STATUS_FLOW.map((s) => (
                <option key={s} value={s}>{JOB_STATUS[s].label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Start" htmlFor="startDate" error={errors.startDate}>
            <Input id="startDate" type="date" value={values.startDate}
                   onChange={(e) => set("startDate", e.target.value)} />
          </Field>

          <Field label="Finish" htmlFor="endDate" error={errors.endDate}>
            <Input id="endDate" type="date" value={values.endDate}
                   onChange={(e) => set("endDate", e.target.value)} />
          </Field>

          <Field label="Scope of work" htmlFor="description" error={errors.description} className="sm:col-span-2"
                 hint="What you agreed to do. This is what shows on the job page for the crew.">
            <Textarea id="description" value={values.description} rows={4}
                      onChange={(e) => set("description", e.target.value)} />
          </Field>

          <div className="sm:col-span-2">
            <label className="flex min-h-[var(--tap)] items-center gap-2.5 font-semibold text-ink-800">
              <input type="checkbox" checked={values.isPriority}
                     onChange={(e) => set("isPriority", e.target.checked)}
                     className="h-5 w-5 rounded border-2 border-ink-400" />
              ⭐ Flag this one — it&apos;ll sit at the top of the jobs list
            </label>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Money"
          subtitle="All amounts exclude GST. Set these once and the job page tracks against them."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Contract value" htmlFor="contractValueCents" error={errors.contractValueCents}
                 hint="What the client is paying, ex GST. Comes across automatically when you convert a quote.">
            <MoneyInput
              id="contractValueCents"
              defaultValue={centsToInput(values.contractValueCents)}
              onBlur={(e) => set("contractValueCents", parseMoneyToCents(e.target.value) ?? 0)}
            />
          </Field>

          <div className="rounded-lg bg-ink-100 p-3">
            <p className="text-sm font-semibold text-ink-600">Budgeted cost</p>
            <p className="tabular text-xl font-black text-ink-900">{formatMoney(budgetTotal)}</p>
            {expectedMargin !== null ? (
              <p className={`text-sm font-semibold ${expectedMargin < 10 ? "text-bad-700" : expectedMargin < 20 ? "text-warn-700" : "text-good-700"}`}>
                {expectedMargin}% margin if it runs to plan
              </p>
            ) : (
              <p className="text-sm text-ink-500">Add a contract value to see the margin</p>
            )}
          </div>

          {BUDGET_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={field.key} error={errors[field.key]}>
              <MoneyInput
                id={field.key}
                defaultValue={centsToInput(values[field.key])}
                onBlur={(e) => set(field.key, parseMoneyToCents(e.target.value) ?? 0)}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card id="crew">
        <CardHeader title="Crew" subtitle="Who's on this job. You can change it any time." />
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {crew.map((member) => {
            const checked = values.crewIds.includes(member.id);
            return (
              <label
                key={member.id}
                className={`flex min-h-[var(--tap)] cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2 ${
                  checked ? "border-brand-600 bg-brand-50" : "border-ink-300 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    set(
                      "crewIds",
                      e.target.checked
                        ? [...values.crewIds, member.id]
                        : values.crewIds.filter((id) => id !== member.id),
                    )
                  }
                  className="h-5 w-5 rounded border-2 border-ink-400"
                />
                <span>
                  <span className="font-semibold text-ink-900">{member.fullName}</span>
                  {member.trade ? <span className="block text-sm text-ink-600">{member.trade}</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Internal notes" subtitle="Only staff see this — never shown to the client" />
        <div className="p-4">
          <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3}
                    aria-label="Internal notes" placeholder="Anything the crew or the office should know." />
        </div>
      </Card>

      <div className="sticky bottom-20 z-20 flex gap-3 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
        <Button type="button" variant="secondary" size="lg" className="flex-1"
                onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="flex-[2]" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save changes" : "Create job"}
        </Button>
      </div>
    </form>
  );
}
