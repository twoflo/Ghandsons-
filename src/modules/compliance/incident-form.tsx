"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveIncident } from "./actions";
import { SEVERITIES } from "./constants";
import { Button, Field, Input, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import type { IncidentRow } from "./queries";

export function IncidentForm({
  incident,
  jobs,
  onDone,
}: {
  incident?: IncidentRow;
  jobs: Array<{ id: string; jobNumber: string; title: string }>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [severity, setSeverity] = useState(incident?.severity ?? "near_miss");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await saveIncident({
        id: incident?.id,
        jobId: data.get("jobId"),
        occurredAt: data.get("occurredAt"),
        severity,
        personInvolved: data.get("personInvolved"),
        description: data.get("description"),
        immediateAction: data.get("immediateAction"),
        correctiveAction: data.get("correctiveAction"),
        reportedToAuthority: data.get("reportedToAuthority") === "on",
        authorityReference: data.get("authorityReference"),
        status: data.get("status"),
      });
      if (result.ok) {
        onDone();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  const defaultWhen = incident
    ? new Date(incident.occurredAt).toISOString().slice(0, 16)
    : new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  return (
    <Card className="border-2 border-brand-500">
      <CardHeader
        title={incident ? `Edit ${incident.incidentNumber}` : "Log an incident"}
        subtitle="Near misses count. They're the ones that tell you what's about to go wrong."
      />
      <form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-2">
        {error ? <div className="sm:col-span-2"><Alert tone="bad">{error}</Alert></div> : null}

        <Field label="How bad?" htmlFor="iseverity" required>
          <Select id="iseverity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>

        <Field label="When?" htmlFor="iwhen" required>
          <Input id="iwhen" name="occurredAt" type="datetime-local" defaultValue={defaultWhen} required />
        </Field>

        {severity === "notifiable" ? (
          <div className="sm:col-span-2">
            <Alert tone="bad" title="A notifiable incident must be reported immediately">
              In Queensland that means calling WorkSafe on 1300 362 128 straight away, and not
              disturbing the site until they say you can.
            </Alert>
          </div>
        ) : null}

        <Field label="Which job?" htmlFor="ijob">
          <Select id="ijob" name="jobId" defaultValue={incident?.jobId ?? ""}>
            <option value="">Not on a job site</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.jobNumber} — {j.title}</option>)}
          </Select>
        </Field>

        <Field label="Who was involved?" htmlFor="iperson">
          <Input id="iperson" name="personInvolved" defaultValue={incident?.personInvolved ?? ""} />
        </Field>

        <Field label="What happened?" htmlFor="idesc" required className="sm:col-span-2"
               hint="Write it as you'd tell it. Plain words, what you actually saw.">
          <Textarea id="idesc" name="description" rows={3} defaultValue={incident?.description ?? ""} required />
        </Field>

        <Field label="What did you do straight away?" htmlFor="iimmediate" className="sm:col-span-2">
          <Textarea id="iimmediate" name="immediateAction" rows={2} defaultValue={incident?.immediateAction ?? ""} />
        </Field>

        <Field label="What's changed so it doesn't happen again?" htmlFor="icorrective" className="sm:col-span-2">
          <Textarea id="icorrective" name="correctiveAction" rows={2} defaultValue={incident?.correctiveAction ?? ""} />
        </Field>

        <div>
          <label className="flex min-h-[var(--tap)] items-center gap-2 font-semibold text-ink-800">
            <input
              type="checkbox"
              name="reportedToAuthority"
              defaultChecked={incident?.reportedToAuthority}
              className="h-5 w-5 rounded border-2 border-ink-400"
            />
            Reported to the regulator
          </label>
        </div>

        <Field label="Their reference" htmlFor="iref">
          <Input id="iref" name="authorityReference" defaultValue={incident?.authorityReference ?? ""} />
        </Field>

        <Field label="Where's it up to?" htmlFor="istatus">
          <Select id="istatus" name="status" defaultValue={incident?.status ?? "open"}>
            <option value="open">Open</option>
            <option value="investigating">Looking into it</option>
            <option value="closed">Closed out</option>
          </Select>
        </Field>

        <div className="flex gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
