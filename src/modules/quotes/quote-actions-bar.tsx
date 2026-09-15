"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setQuoteStatus, convertQuoteToJob, reviseQuote } from "./actions";
import { Button, Input, Field, Alert, Card, CardHeader, Select } from "@/components/ui";
import { isoDate } from "@/lib/dates";

/**
 * Everything you can do to a quote, in the order it actually happens:
 * send it, hear back, then turn a yes into a job.
 */
export function QuoteActionsBar({
  quoteId,
  status,
  hasJob,
  jobTypes,
}: {
  quoteId: string;
  status: string;
  hasJob: boolean;
  jobTypes: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"accept" | "reject" | "convert" | null>(null);
  const [acceptedBy, setAcceptedBy] = useState("");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState(isoDate(new Date()));
  const [endDate, setEndDate] = useState("");
  const [jobTypeId, setJobTypeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setPanel(null);
        setNotice(result.message ?? "Done.");
        after?.();
        router.refresh();
      } else {
        setError(result.message ?? "That didn't work.");
      }
    });
  }

  return (
    <Card>
      <CardHeader title="What now?" />
      <div className="space-y-3 p-4">
        {error ? <Alert tone="bad">{error}</Alert> : null}
        {notice ? <Alert tone="good">{notice}</Alert> : null}

        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/pdf/quote/${quoteId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-4 font-semibold"
          >
            📄 View PDF
          </a>
          <a
            href={`/api/pdf/quote/${quoteId}?download=1`}
            className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-4 font-semibold"
          >
            ⬇️ Download
          </a>

          {status === "draft" ? (
            <Button
              onClick={() => run(() => setQuoteStatus({ quoteId, status: "sent" }))}
              disabled={pending}
            >
              Mark as sent
            </Button>
          ) : null}

          {status === "sent" || status === "expired" ? (
            <>
              <Button variant="success" onClick={() => setPanel(panel === "accept" ? null : "accept")} disabled={pending}>
                They said yes
              </Button>
              <Button variant="danger" onClick={() => setPanel(panel === "reject" ? null : "reject")} disabled={pending}>
                They said no
              </Button>
            </>
          ) : null}

          {status === "accepted" ? (
            <Button variant="success" onClick={() => setPanel(panel === "convert" ? null : "convert")} disabled={pending}>
              {hasJob ? "Update the job from this quote" : "Turn it into a job"}
            </Button>
          ) : null}

          {status !== "draft" ? (
            <Button
              variant="secondary"
              onClick={() =>
                run(async () => {
                  const result = await reviseQuote({ quoteId });
                  if (result.ok) router.push(`/quotes/${result.data.id}/edit`);
                  return result;
                })
              }
              disabled={pending}
            >
              Start a revision
            </Button>
          ) : null}
        </div>

        {panel === "accept" ? (
          <div className="rounded-lg border-2 border-good-600 bg-good-50 p-3">
            <Field label="Who accepted it?" htmlFor="acceptedBy" required
                   hint="Their name goes on the record and on the PDF.">
              <Input id="acceptedBy" value={acceptedBy} onChange={(e) => setAcceptedBy(e.target.value)} autoFocus />
            </Field>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPanel(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="success"
                className="flex-1"
                disabled={pending || !acceptedBy.trim()}
                onClick={() => run(() => setQuoteStatus({ quoteId, status: "accepted", acceptedByName: acceptedBy }))}
              >
                {pending ? "Saving…" : "Mark accepted"}
              </Button>
            </div>
          </div>
        ) : null}

        {panel === "reject" ? (
          <div className="rounded-lg border-2 border-bad-600 bg-bad-50 p-3">
            <Field label="Why did we lose it?" htmlFor="reason"
                   hint="Worth recording — it's the only way to spot a pattern.">
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)}
                     placeholder="Too dear, went with someone else, job's off…" autoFocus />
            </Field>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPanel(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={pending}
                onClick={() => run(() => setQuoteStatus({ quoteId, status: "rejected", rejectedReason: reason }))}
              >
                {pending ? "Saving…" : "Mark lost"}
              </Button>
            </div>
          </div>
        ) : null}

        {panel === "convert" ? (
          <div className="rounded-lg border-2 border-good-600 bg-good-50 p-3">
            <p className="mb-3 text-sm text-ink-700">
              The job&apos;s budget comes straight from this quote&apos;s costs, and the contract value
              from the price ex GST. You can change both later.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Start" htmlFor="convStart">
                <Input id="convStart" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="Finish" htmlFor="convEnd">
                <Input id="convEnd" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
              <Field label="Type of work" htmlFor="convType">
                <Select id="convType" value={jobTypeId} onChange={(e) => setJobTypeId(e.target.value)}>
                  <option value="">Not set</option>
                  {jobTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setPanel(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant="success"
                className="flex-1"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const result = await convertQuoteToJob({ quoteId, startDate, endDate, jobTypeId });
                    if (result.ok) router.push(`/jobs/${result.data.jobId}`);
                    return result;
                  })
                }
              >
                {pending ? "Creating…" : hasJob ? "Update the job" : "Create the job"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
