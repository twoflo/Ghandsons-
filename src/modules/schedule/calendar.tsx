"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { moveScheduleEvent } from "./actions";
import type { ScheduleEvent, DoubleBooking, UnscheduledJob } from "./queries";
import { Alert, Button, Card, CardHeader, Badge } from "@/components/ui";
import { isoDate, formatDate } from "@/lib/dates";

type Props = {
  days: string[];
  events: ScheduleEvent[];
  clashes: DoubleBooking[];
  unscheduled: UnscheduledJob[];
  view: "week" | "month";
  monthAnchor?: string;
  canManage: boolean;
};

/**
 * The calendar.
 *
 * Two ways to move a booking, because one of them has to work with a thumb:
 *   - laptop: drag the block onto a day
 *   - phone: tap the block, then tap the day (there is no reliable one-handed
 *     drag on a touch screen, and a mis-drag that silently reschedules a crew
 *     is worse than a second tap)
 * Both call the same server action, so they can't drift apart.
 */
export function ScheduleCalendar({
  days, events, clashes, unscheduled, view, monthAnchor, canManage,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [moving, setMoving] = useState<ScheduleEvent | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = isoDate(new Date());
  const clashDays = new Map<string, DoubleBooking[]>();
  for (const clash of clashes) {
    clashDays.set(clash.day, [...(clashDays.get(clash.day) ?? []), clash]);
  }

  function eventsOn(day: string) {
    return events.filter((e) => day >= e.startDate && day <= e.endDate);
  }

  function move(eventId: string, day: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await moveScheduleEvent({ eventId, startDate: day });
      if (result.ok) {
        setMessage(result.message ?? "Moved.");
        setMoving(null);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  const dayCell = (day: string) => {
    const dayEvents = eventsOn(day);
    const dayClashes = clashDays.get(day) ?? [];
    const isToday = day === today;
    const weekend = [0, 6].includes(new Date(`${day}T00:00:00`).getDay());
    const inMonth = !monthAnchor || day.slice(0, 7) === monthAnchor.slice(0, 7);

    return (
      <div
        key={day}
        onDragOver={canManage ? (e) => e.preventDefault() : undefined}
        onDrop={
          canManage
            ? (e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (id) move(id, day);
                setDragging(null);
              }
            : undefined
        }
        className={clsx(
          "min-h-28 border-b border-r border-ink-200 p-1.5",
          isToday && "bg-brand-50",
          weekend && !isToday && "bg-ink-50",
          !inMonth && "opacity-45",
          dragging && canManage && "outline-dashed outline-2 -outline-offset-2 outline-info-500",
        )}
      >
        <div className="mb-1 flex items-center justify-between">
          <span
            className={clsx(
              "text-xs font-bold",
              isToday ? "rounded bg-brand-600 px-1.5 py-0.5 text-white" : "text-ink-500",
            )}
          >
            {view === "week"
              ? new Date(`${day}T00:00:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric" })
              : new Date(`${day}T00:00:00`).getDate()}
          </span>
          {dayClashes.length > 0 ? (
            <span
              title={dayClashes.map((c) => `${c.userName} is double-booked`).join("\n")}
              className="text-sm"
              aria-label={`${dayClashes.length} double booking${dayClashes.length === 1 ? "" : "s"}`}
            >
              ⚠️
            </span>
          ) : null}
        </div>

        {moving && canManage ? (
          <button
            type="button"
            onClick={() => move(moving.id, day)}
            disabled={pending}
            className="mb-1 w-full rounded border-2 border-dashed border-info-600 bg-info-50 py-1.5 text-xs font-bold text-info-700"
          >
            Move here
          </button>
        ) : null}

        <ul className="space-y-1">
          {dayEvents.map((event) => {
            const isFirstDay = event.startDate === day;
            const colour = event.colour ?? event.jobTypeColour ?? "#64748b";
            const clashed = dayClashes.some((c) => c.events.some((e) => e.id === event.id));
            return (
              <li key={event.id}>
                <div
                  draggable={canManage}
                  onDragStart={
                    canManage
                      ? (e) => {
                          e.dataTransfer.setData("text/plain", event.id);
                          setDragging(event.id);
                        }
                      : undefined
                  }
                  onDragEnd={() => setDragging(null)}
                  className={clsx(
                    "rounded px-1.5 py-1 text-xs leading-tight text-white",
                    canManage && "cursor-grab active:cursor-grabbing",
                    clashed && "ring-2 ring-bad-600",
                    event.kind === "leave" && "opacity-70",
                  )}
                  style={{ background: colour }}
                >
                  {isFirstDay || view === "week" ? (
                    <>
                      <span className="block truncate font-bold">
                        {event.kind === "leave" ? "🌴 " : event.kind === "delivery" ? "🚚 " : event.kind === "inspection" ? "🔍 " : ""}
                        {event.jobNumber ?? ""} {event.title}
                      </span>
                      {event.crew.length > 0 ? (
                        <span className="block truncate opacity-90">
                          {event.crew.map((c) => c.name.split(" ")[0]).join(", ")}
                        </span>
                      ) : (
                        <span className="block italic opacity-90">No crew</span>
                      )}
                    </>
                  ) : (
                    <span className="block truncate opacity-90">↳ {event.title}</span>
                  )}
                </div>
                {canManage && isFirstDay ? (
                  <div className="mt-0.5 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setMoving(moving?.id === event.id ? null : event)}
                      className={clsx(
                        "rounded px-1 text-[10px] font-bold",
                        moving?.id === event.id ? "bg-info-600 text-white" : "text-ink-500 hover:bg-ink-200",
                      )}
                    >
                      {moving?.id === event.id ? "Pick a day…" : "Move"}
                    </button>
                    {event.jobId ? (
                      <Link href={`/jobs/${event.jobId}`} className="rounded px-1 text-[10px] font-bold text-ink-500 hover:bg-ink-200">
                        Job
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {message ? <Alert tone="good">{message}</Alert> : null}
      {error ? <Alert tone="bad">{error}</Alert> : null}

      {moving ? (
        <Alert tone="info" title={`Moving "${moving.title}"`}>
          Tap the day you want it on. It keeps its length and its crew.
          <Button size="sm" variant="secondary" className="ml-3" onClick={() => setMoving(null)}>
            Cancel
          </Button>
        </Alert>
      ) : null}

      {clashes.length > 0 ? (
        <Card className="border-2 border-bad-600">
          <CardHeader
            title={`${clashes.length} double booking${clashes.length === 1 ? "" : "s"}`}
            subtitle="Somebody is in two places at once"
          />
          <ul className="divide-y divide-ink-200">
            {clashes.map((clash) => (
              <li key={`${clash.userId}-${clash.day}`} className="px-4 py-2.5">
                <p className="font-semibold text-ink-900">
                  {clash.userName} — {formatDate(clash.day)}
                </p>
                <p className="text-sm text-ink-600">
                  {clash.events.map((e) => `${e.jobNumber ?? ""} ${e.title}`.trim()).join("  ·  ")}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="overflow-x-auto">
        <div className={clsx("min-w-[52rem] border-l border-t border-ink-200 bg-white", "grid grid-cols-7")}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
            <div
              key={label}
              className="border-b border-r border-ink-200 bg-ink-100 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-ink-600"
            >
              {label}
            </div>
          ))}
          {days.map(dayCell)}
        </div>
      </div>

      {unscheduled.length > 0 && canManage ? (
        <Card>
          <CardHeader
            title="Not on the calendar"
            subtitle="Won or running, with nothing booked in"
          />
          <ul className="divide-y divide-ink-200">
            {unscheduled.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink-900">
                    {job.jobNumber} — {job.title}
                  </p>
                  <p className="truncate text-sm text-ink-600">{job.clientName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={job.status === "won" ? "good" : "brand"}>{job.status.replace("_", " ")}</Badge>
                  <Link
                    href={`/schedule/new?jobId=${job.id}`}
                    className="inline-flex min-h-9 items-center rounded-lg border-2 border-brand-600 bg-brand-600 px-3 text-sm font-bold text-white"
                  >
                    Book it in
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
