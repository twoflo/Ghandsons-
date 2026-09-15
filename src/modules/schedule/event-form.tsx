"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScheduleEvent, removeScheduleEvent } from "./actions";
import { Button, Field, Input, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import { addDaysIso, formatDate } from "@/lib/dates";
import type { CrewOption } from "./queries";

const KINDS = [
  { value: "work", label: "Work on a job" },
  { value: "leave", label: "Leave / RDO / TAFE" },
  { value: "delivery", label: "Delivery" },
  { value: "inspection", label: "Inspection" },
  { value: "other", label: "Something else" },
];

export function ScheduleEventForm({
  initial,
  jobs,
  crew,
}: {
  initial: {
    id?: string;
    jobId: string;
    title: string;
    kind: string;
    startDate: string;
    endDate: string;
    notes: string;
    userIds: string[];
  };
  jobs: Array<{ id: string; jobNumber: string; title: string; clientName: string }>;
  crew: CrewOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const dayCount =
    (new Date(`${values.endDate}T00:00:00`).getTime() -
      new Date(`${values.startDate}T00:00:00`).getTime()) /
      86_400_000 +
    1;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    startTransition(async () => {
      const result = await saveScheduleEvent(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message);
        return;
      }
      router.push("/schedule");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {message ? <Alert tone="bad">{message}</Alert> : null}

      <Card>
        <CardHeader title="What and when" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="What sort of block?" htmlFor="kind">
            <Select id="kind" value={values.kind} onChange={(e) => set("kind", e.target.value)}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </Select>
          </Field>

          {values.kind === "work" || values.kind === "delivery" || values.kind === "inspection" ? (
            <Field label="Job" htmlFor="jobId" error={errors.jobId}>
              <Select id="jobId" value={values.jobId} onChange={(e) => set("jobId", e.target.value)}>
                <option value="">Not against a job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.jobNumber} — {j.title} ({j.clientName})
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field
            label="What to call it"
            htmlFor="title"
            error={errors.title}
            className="sm:col-span-2"
            hint="Leave blank on a job block and it uses the job's name."
          >
            <Input
              id="title"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={values.kind === "leave" ? "Tyler — TAFE block" : "Roof sheeting"}
            />
          </Field>

          <Field label="First day" htmlFor="startDate" error={errors.startDate} required>
            <Input
              id="startDate"
              type="date"
              value={values.startDate}
              onChange={(e) => {
                const start = e.target.value;
                set("startDate", start);
                if (values.endDate < start) set("endDate", start);
              }}
              required
            />
          </Field>

          <Field
            label="Last day"
            htmlFor="endDate"
            error={errors.endDate}
            required
            hint={
              Number.isFinite(dayCount) && dayCount > 0
                ? `${dayCount} day${dayCount === 1 ? "" : "s"} on site`
                : undefined
            }
          >
            <Input
              id="endDate"
              type="date"
              value={values.endDate}
              min={values.startDate}
              onChange={(e) => set("endDate", e.target.value)}
              required
            />
          </Field>

          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {[1, 2, 3, 5].map((n) => (
              <Button
                key={n}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => set("endDate", addDaysIso(values.startDate, n - 1))}
              >
                {n} day{n === 1 ? "" : "s"}
              </Button>
            ))}
          </div>

          <Field label="Anything the crew needs to know" htmlFor="notes" className="sm:col-span-2">
            <Textarea
              id="notes"
              rows={2}
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Tiler on site Wednesday. Don't walk on it Thursday."
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Who's on it"
          subtitle={
            values.userIds.length
              ? `${values.userIds.length} booked${
                  values.startDate === values.endDate
                    ? ` for ${formatDate(values.startDate)}`
                    : ""
                }`
              : "Nobody yet — you'll be warned about clashes once you pick"
          }
        />
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {crew.map((member) => {
            const checked = values.userIds.includes(member.id);
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
                      "userIds",
                      e.target.checked
                        ? [...values.userIds, member.id]
                        : values.userIds.filter((id) => id !== member.id),
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

      <div className="sticky bottom-20 z-20 flex gap-3 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
        {values.id ? (
          <Button
            type="button"
            variant="danger"
            size="lg"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await removeScheduleEvent({ eventId: values.id! });
                if (result.ok) {
                  router.push("/schedule");
                  router.refresh();
                } else {
                  setMessage(result.message);
                }
              })
            }
          >
            Remove
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="lg" className="flex-[2]" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save changes" : "Book it in"}
        </Button>
      </div>
    </form>
  );
}
