"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  saveManualTimeEntry, deleteTimeEntry, submitTimesheetWeek,
  approveTimesheetWeek, rejectTimesheetWeek,
} from "./timesheet-actions";
import { Button, Field, Input, Select, Textarea, Alert, Card, CardHeader, Badge } from "@/components/ui";
import { formatHours, formatMoney, minutesToHours } from "@/lib/money";
import { formatDayLabel, isoDate } from "@/lib/dates";
import { TIME_STATUS, type TimeStatus } from "@/lib/status";
import type { TimeEntryRow } from "./timesheet-queries";

type JobOption = { id: string; jobNumber: string; title: string };

/**
 * One person's week.
 *
 * Laid out day by day rather than as a flat list, because that's how someone
 * reconstructs a week on a Friday afternoon: "Monday I was at Ashgrove,
 * Tuesday…". Each day has an Add button that pre-fills the date.
 */
export function TimesheetWeek({
  userId,
  userName,
  weekStart,
  days,
  entries,
  jobs,
  status,
  rejectedReason,
  canApprove,
  canEdit,
  showCost,
}: {
  userId: string;
  userName: string;
  weekStart: string;
  days: string[];
  entries: TimeEntryRow[];
  jobs: JobOption[];
  status: string;
  rejectedReason: string | null;
  canApprove: boolean;
  canEdit: boolean;
  showCost: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const totalMinutes = entries.reduce((a, e) => a + e.minutes, 0);
  const totalCost = entries.reduce((a, e) => a + e.costCents, 0);
  const statusInfo = TIME_STATUS[status as TimeStatus] ?? TIME_STATUS.draft;
  const locked = status === "approved" && !canApprove;

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setNotice(result.message ?? "Done.");
        setAdding(null);
        setEditing(null);
        setRejecting(false);
        router.refresh();
      } else {
        setError(result.message ?? "That didn't work.");
      }
    });
  }

  function submitEntry(event: React.FormEvent<HTMLFormElement>, day: string, entryId?: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run(() =>
      saveManualTimeEntry({
        id: entryId,
        userId,
        jobId: data.get("jobId"),
        workDate: day,
        hours: data.get("hours"),
        breakMinutes: data.get("breakMinutes"),
        description: data.get("description"),
      }),
    );
  }

  return (
    <Card>
      <CardHeader
        title={userName}
        subtitle={`${formatHours(totalMinutes)} this week${showCost ? ` · ${formatMoney(totalCost)} of labour` : ""}`}
        action={<Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>}
      />

      {rejectedReason && status === "rejected" ? (
        <div className="px-4 pt-3">
          <Alert tone="bad" title="Sent back">{rejectedReason}</Alert>
        </div>
      ) : null}
      {error ? <div className="px-4 pt-3"><Alert tone="bad">{error}</Alert></div> : null}
      {notice ? <div className="px-4 pt-3"><Alert tone="good">{notice}</Alert></div> : null}

      <ul className="divide-y divide-ink-200">
        {days.map((day) => {
          const dayEntries = entries.filter((e) => e.workDate === day);
          const dayMinutes = dayEntries.reduce((a, e) => a + e.minutes, 0);
          const isToday = day === isoDate(new Date());

          return (
            <li key={day} className={isToday ? "bg-brand-50" : undefined}>
              <div className="flex items-center justify-between gap-3 px-4 py-2">
                <span className={`text-sm font-bold ${isToday ? "text-brand-700" : "text-ink-600"}`}>
                  {formatDayLabel(day)}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular font-bold text-ink-900">
                    {dayMinutes > 0 ? formatHours(dayMinutes) : "—"}
                  </span>
                  {canEdit && !locked ? (
                    <button
                      type="button"
                      onClick={() => setAdding(adding === day ? null : day)}
                      className="min-h-9 rounded-lg border-2 border-ink-300 px-2 text-sm font-bold text-ink-700"
                    >
                      {adding === day ? "Cancel" : "+ Add"}
                    </button>
                  ) : null}
                </span>
              </div>

              {dayEntries.map((entry) =>
                editing === entry.id ? (
                  <div key={entry.id} className="border-t border-ink-200 bg-ink-50 px-4 py-3">
                    <EntryFields
                      jobs={jobs}
                      entry={entry}
                      pending={pending}
                      onCancel={() => setEditing(null)}
                      onSubmit={(e) => submitEntry(e, entry.workDate, entry.id)}
                    />
                  </div>
                ) : (
                  <div key={entry.id} className="flex items-start gap-3 border-t border-ink-100 px-4 py-2 pl-8">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {entry.jobNumber ? (
                          <Link href={`/jobs/${entry.jobId}`} className="underline">
                            {entry.jobNumber}
                          </Link>
                        ) : (
                          <span className="text-bad-700">No job</span>
                        )}{" "}
                        {entry.jobTitle}
                      </p>
                      <p className="text-sm text-ink-600">
                        {entry.description ?? "—"}
                        {entry.breakMinutes > 0 ? ` · ${entry.breakMinutes}m break` : ""}
                        {entry.source === "clock" ? " · clocked" : ""}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-sm font-semibold">
                      {entry.status === "open" ? "Running" : formatHours(entry.minutes)}
                    </span>
                    {canEdit && !locked && entry.status !== "open" ? (
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(entry.id)}
                          className="min-h-9 rounded px-2 text-sm font-bold text-ink-500 hover:bg-ink-200"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => deleteTimeEntry({ entryId: entry.id }))}
                          className="min-h-9 rounded px-2 text-sm font-bold text-bad-700 hover:bg-bad-50"
                        >
                          ✕
                        </button>
                      </span>
                    ) : null}
                  </div>
                ),
              )}

              {adding === day ? (
                <div className="border-t border-ink-200 bg-ink-50 px-4 py-3">
                  <EntryFields
                    jobs={jobs}
                    pending={pending}
                    onCancel={() => setAdding(null)}
                    onSubmit={(e) => submitEntry(e, day)}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-ink-300 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink-600">Week total</p>
          <p className="tabular text-xl font-black text-ink-900">
            {formatHours(totalMinutes)}
            <span className="ml-2 text-sm font-semibold text-ink-500">
              {minutesToHours(totalMinutes)} hrs
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (status === "draft" || status === "rejected") ? (
            <Button
              disabled={pending || totalMinutes === 0}
              onClick={() => run(() => submitTimesheetWeek({ userId, weekStart }))}
            >
              {pending ? "Sending…" : "Send for approval"}
            </Button>
          ) : null}

          {canApprove && (status === "submitted" || status === "draft") ? (
            <>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => setRejecting((r) => !r)}
              >
                Send it back
              </Button>
              <Button
                variant="success"
                disabled={pending}
                onClick={() => run(() => approveTimesheetWeek({ userId, weekStart }))}
              >
                {pending ? "Approving…" : "Approve"}
              </Button>
            </>
          ) : null}

          {status === "approved" ? (
            <span className="text-sm font-semibold text-good-700">
              ✓ Approved — counted against the jobs
            </span>
          ) : null}
        </div>
      </div>

      {rejecting ? (
        <div className="border-t border-ink-200 bg-bad-50 px-4 py-3">
          <Field label="What needs fixing?" htmlFor={`reject-${userId}`} required>
            <Textarea
              id={`reject-${userId}`}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Thursday's hours are on the wrong job."
              autoFocus
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRejecting(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={pending || reason.trim().length < 3}
              onClick={() => run(() => rejectTimesheetWeek({ userId, weekStart, reason }))}
            >
              Send it back
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function EntryFields({
  jobs, entry, pending, onCancel, onSubmit,
}: {
  jobs: JobOption[];
  entry?: TimeEntryRow;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4">
      <Field label="Job" htmlFor={`job-${entry?.id ?? "new"}`} required className="sm:col-span-2">
        <Select id={`job-${entry?.id ?? "new"}`} name="jobId" defaultValue={entry?.jobId ?? ""} required>
          <option value="">Choose a job…</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>{j.jobNumber} — {j.title}</option>
          ))}
        </Select>
      </Field>
      <Field label="Hours" htmlFor={`hours-${entry?.id ?? "new"}`} required>
        <Input
          id={`hours-${entry?.id ?? "new"}`}
          name="hours"
          inputMode="decimal"
          defaultValue={entry ? String(minutesToHours(entry.minutes + entry.breakMinutes)) : "8"}
          className="tabular text-right"
          required
        />
      </Field>
      <Field label="Break (mins)" htmlFor={`break-${entry?.id ?? "new"}`}>
        <Input
          id={`break-${entry?.id ?? "new"}`}
          name="breakMinutes"
          type="number"
          inputMode="numeric"
          min={0}
          max={480}
          defaultValue={entry?.breakMinutes ?? 30}
          className="tabular text-right"
        />
      </Field>
      <Field label="What were you doing?" htmlFor={`desc-${entry?.id ?? "new"}`} className="sm:col-span-4">
        <Input
          id={`desc-${entry?.id ?? "new"}`}
          name="description"
          defaultValue={entry?.description ?? ""}
          placeholder="Framing the first floor"
        />
      </Field>
      <div className="flex gap-2 sm:col-span-4">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending ? "Saving…" : "Save hours"}
        </Button>
      </div>
    </form>
  );
}
