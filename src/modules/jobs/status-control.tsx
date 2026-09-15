"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeJobStatus } from "./actions";
import { JOB_STATUS, nextJobStatuses, type JobStatus } from "@/lib/status";
import { Button, Select, Alert } from "@/components/ui";

export function JobStatusControl({ jobId, current }: { jobId: string; current: JobStatus }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<JobStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options = nextJobStatuses(current);

  function submit() {
    if (!status) return;
    setError(null);
    startTransition(async () => {
      const result = await changeJobStatus({ jobId, status });
      if (result.ok) {
        setOpen(false);
        setStatus("");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Change status
      </Button>
    );
  }

  return (
    <div className="w-64 rounded-lg border-2 border-ink-300 bg-white p-3 text-left">
      <label htmlFor="newStatus" className="field-label">Move this job to</label>
      <Select
        id="newStatus"
        value={status}
        onChange={(e) => setStatus(e.target.value as JobStatus)}
        disabled={pending}
      >
        <option value="">Choose…</option>
        {options.map((s) => (
          <option key={s} value={s}>{JOB_STATUS[s].label}</option>
        ))}
      </Select>
      {status ? <p className="field-hint">{JOB_STATUS[status].hint}</p> : null}
      {error ? <div className="mt-2"><Alert tone="bad">{error}</Alert></div> : null}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" className="flex-1" onClick={submit} disabled={pending || !status}>
          {pending ? "Saving…" : "Move"}
        </Button>
      </div>
    </div>
  );
}
