import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getWorkerDay } from "@/modules/schedule/queries";
import { PageHeader, Card, Badge, EmptyState, LinkButton } from "@/components/ui";
import { isoDate, formatDate, addDaysIso } from "@/lib/dates";

export const metadata = { title: "Who's where" };
export const dynamic = "force-dynamic";

export default async function WorkerDayPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  await requireUser();
  const { day = isoDate(new Date()) } = await searchParams;
  const workers = await getWorkerDay(day);

  const idle = workers.filter((w) => w.events.length === 0);
  const busy = workers.filter((w) => w.events.length > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Who's where"
        subtitle={formatDate(day)}
        back={{ href: "/schedule", label: "Calendar" }}
      />

      <div className="mb-4 flex gap-2">
        <Link
          href={`/schedule/day?day=${addDaysIso(day, -1)}`}
          className="inline-flex min-h-[var(--tap)] flex-1 items-center justify-center rounded-lg border-2 border-ink-300 bg-white font-bold"
        >
          ← Yesterday
        </Link>
        <Link
          href="/schedule/day"
          className="inline-flex min-h-[var(--tap)] flex-1 items-center justify-center rounded-lg border-2 border-ink-300 bg-white font-bold"
        >
          Today
        </Link>
        <Link
          href={`/schedule/day?day=${addDaysIso(day, 1)}`}
          className="inline-flex min-h-[var(--tap)] flex-1 items-center justify-center rounded-lg border-2 border-ink-300 bg-white font-bold"
        >
          Tomorrow →
        </Link>
      </div>

      {workers.length === 0 ? (
        <Card>
          <EmptyState icon="🦺" title="No crew set up" body="Add people under Crew and they'll show here." />
        </Card>
      ) : (
        <div className="space-y-3">
          {busy.map((worker) => (
            <Card key={worker.userId}>
              <div className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-700 text-sm font-bold text-white">
                  {worker.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink-900">{worker.fullName}</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {worker.events.map((event) => (
                      <li key={event.id} className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
                          style={{ background: event.colour ?? "#64748b" }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 truncate text-ink-800">
                          {event.jobNumber ? <span className="font-semibold">{event.jobNumber} </span> : null}
                          {event.title}
                        </span>
                        {event.kind !== "work" ? <Badge>{event.kind}</Badge> : null}
                      </li>
                    ))}
                  </ul>
                  {worker.events.length > 1 ? (
                    <p className="mt-2 text-sm font-bold text-bad-700">
                      ⚠️ Booked on {worker.events.length} things at once
                    </p>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}

          {idle.length > 0 ? (
            <Card>
              <div className="p-4">
                <p className="text-sm font-bold uppercase tracking-wide text-ink-500">Nothing booked</p>
                <p className="mt-1 text-ink-800">{idle.map((w) => w.fullName).join(", ")}</p>
                <LinkButton href="/schedule" variant="secondary" size="sm" className="mt-3">
                  Put them on something
                </LinkButton>
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
