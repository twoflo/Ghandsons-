import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listEvents, findDoubleBookings, listUnscheduledJobs } from "@/modules/schedule/queries";
import { ScheduleCalendar } from "@/modules/schedule/calendar";
import { PageHeader, LinkButton } from "@/components/ui";
import { isoDate, weekStart, weekDays, monthGrid, addDaysIso, formatDate } from "@/lib/dates";
import { addMonths, parseISO, format } from "date-fns";

export const metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: "week" | "month"; anchor?: string }>;
}) {
  const user = await requireUser();
  const { view = "week", anchor } = await searchParams;

  const anchorDate = anchor ? parseISO(anchor) : new Date();
  const days =
    view === "month"
      ? monthGrid(anchorDate).map(isoDate)
      : weekDays(anchorDate).map(isoDate);

  const from = days[0]!;
  const to = days[days.length - 1]!;

  const [events, clashes, unscheduled] = await Promise.all([
    listEvents(from, to),
    findDoubleBookings(from, to),
    can(user.role, "schedule.manage") ? listUnscheduledJobs() : Promise.resolve([]),
  ]);

  const prev = view === "month"
    ? isoDate(addMonths(anchorDate, -1))
    : addDaysIso(weekStart(anchorDate), -7);
  const next = view === "month"
    ? isoDate(addMonths(anchorDate, 1))
    : addDaysIso(weekStart(anchorDate), 7);

  const heading =
    view === "month"
      ? format(anchorDate, "MMMM yyyy")
      : `${formatDate(from)} – ${formatDate(to)}`;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Schedule"
        subtitle={heading}
        action={
          can(user.role, "schedule.manage") ? (
            <LinkButton href="/schedule/new">+ Book something in</LinkButton>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border-2 border-ink-300">
          <Link
            href={`/schedule?view=${view}&anchor=${prev}`}
            className="inline-flex min-h-[var(--tap)] items-center bg-white px-3 font-bold text-ink-700 hover:bg-ink-100"
            aria-label="Previous"
          >
            ←
          </Link>
          <Link
            href={`/schedule?view=${view}`}
            className="inline-flex min-h-[var(--tap)] items-center border-x-2 border-ink-300 bg-white px-4 font-bold text-ink-700 hover:bg-ink-100"
          >
            Today
          </Link>
          <Link
            href={`/schedule?view=${view}&anchor=${next}`}
            className="inline-flex min-h-[var(--tap)] items-center bg-white px-3 font-bold text-ink-700 hover:bg-ink-100"
            aria-label="Next"
          >
            →
          </Link>
        </div>

        <div className="flex overflow-hidden rounded-lg border-2 border-ink-300">
          {(["week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={`/schedule?view=${v}${anchor ? `&anchor=${anchor}` : ""}`}
              className={`inline-flex min-h-[var(--tap)] items-center px-4 font-bold capitalize ${
                view === v ? "bg-brand-600 text-white" : "bg-white text-ink-700 hover:bg-ink-100"
              }`}
            >
              {v}
            </Link>
          ))}
        </div>

        <Link
          href="/schedule/day"
          className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-4 font-bold text-ink-700 hover:bg-ink-100"
        >
          Who&apos;s where today
        </Link>
      </div>

      <ScheduleCalendar
        days={days}
        events={events}
        clashes={clashes}
        unscheduled={unscheduled}
        view={view}
        monthAnchor={view === "month" ? isoDate(anchorDate) : undefined}
        canManage={can(user.role, "schedule.manage")}
      />
    </div>
  );
}
