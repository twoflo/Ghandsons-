import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCrew } from "@/modules/crew/queries";
import { formatMoney, formatHours, marginBp, formatBp } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { PageHeader, Card, Badge, EmptyState, StatTile } from "@/components/ui";
import { RateEditor } from "@/modules/crew/rate-editor";

export const metadata = { title: "Crew" };
export const dynamic = "force-dynamic";

export default async function CrewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "crew.view")) redirect("/dashboard");

  const crew = await getCrew();
  const showRates = can(user.role, "crew.viewRates");
  const canManage = can(user.role, "crew.manage");

  const employees = crew.filter((c) => c.employmentType !== "subcontractor" && c.isActive);
  const subbies = crew.filter((c) => c.employmentType === "subcontractor" && c.isActive);
  const inactive = crew.filter((c) => !c.isActive);

  const weekMinutes = crew.reduce((a, c) => a + c.minutesThisWeek, 0);
  const expired = crew.reduce((a, c) => a + c.expiredDocs, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Crew"
        subtitle={`${employees.length} on the books · ${subbies.length} subcontractors`}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Hours this week" value={formatHours(weekMinutes)} />
        <StatTile
          label="Expired tickets"
          value={expired}
          sub={expired > 0 ? "Someone's on site without one" : "Everyone's current"}
          tone={expired > 0 ? "bad" : "good"}
          href="/compliance"
        />
        <StatTile label="On the tools" value={employees.length + subbies.length} />
      </div>

      {crew.length === 0 ? (
        <Card>
          <EmptyState icon="🦺" title="Nobody set up yet" body="Add your crew under Settings → Users." />
        </Card>
      ) : (
        <div className="space-y-6">
          <CrewSection title="On the books" members={employees} showRates={showRates} canManage={canManage} />
          {subbies.length > 0 ? (
            <CrewSection title="Subcontractors" members={subbies} showRates={showRates} canManage={canManage} />
          ) : null}
          {inactive.length > 0 ? (
            <CrewSection title="No longer with us" members={inactive} showRates={showRates} canManage={false} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function CrewSection({
  title, members, showRates, canManage,
}: {
  title: string;
  members: Awaited<ReturnType<typeof getCrew>>;
  showRates: boolean;
  canManage: boolean;
}) {
  if (members.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">{title}</h2>
      <ul className="space-y-3">
        {members.map((member) => {
          const margin =
            member.costRateCents && member.chargeRateCents
              ? marginBp(member.costRateCents, member.chargeRateCents)
              : null;
          return (
            <li key={member.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink-900">
                    {member.fullName}
                    {member.expiredDocs > 0 ? (
                      <Link href="/compliance" className="ml-2 align-middle">
                        <Badge tone="bad">
                          {member.expiredDocs} expired ticket{member.expiredDocs === 1 ? "" : "s"}
                        </Badge>
                      </Link>
                    ) : null}
                  </p>
                  <p className="text-sm text-ink-600">
                    {[member.trade, ROLE_LABELS[member.role as Role]].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm">
                    {member.phone ? (
                      <a href={`tel:${member.phone.replace(/\s/g, "")}`} className="font-semibold text-info-700 underline">
                        {member.phone}
                      </a>
                    ) : null}
                    <a href={`mailto:${member.email}`} className="break-all text-ink-600 underline">
                      {member.email}
                    </a>
                  </div>
                  {member.abn ? <p className="mt-1 text-sm text-ink-500">ABN {member.abn}</p> : null}
                  {member.startDate ? (
                    <p className="text-sm text-ink-500">Started {formatDate(member.startDate)}</p>
                  ) : null}
                </div>

                <div className="text-right">
                  <p className="tabular text-lg font-black text-ink-900">
                    {formatHours(member.minutesThisWeek)}
                  </p>
                  <p className="text-sm text-ink-500">this week</p>
                  {member.openJobs > 0 ? (
                    <p className="mt-1 text-sm text-ink-600">
                      {member.openJobs} live job{member.openJobs === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
              </div>

              {showRates ? (
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-ink-200 pt-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Costs us</p>
                    <p className="tabular font-bold">{formatMoney(member.costRateCents ?? 0)}/hr</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Charged out</p>
                    <p className="tabular font-bold">{formatMoney(member.chargeRateCents ?? 0)}/hr</p>
                  </div>
                  {margin !== null && member.chargeRateCents ? (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Margin</p>
                      <p
                        className={`tabular font-bold ${
                          margin < 2000 ? "text-bad-700" : margin < 3500 ? "text-warn-700" : "text-good-700"
                        }`}
                      >
                        {formatBp(margin)}
                      </p>
                    </div>
                  ) : null}
                  {canManage ? (
                    <div className="ml-auto">
                      <RateEditor
                        userId={member.id}
                        fullName={member.fullName}
                        costRateCents={member.costRateCents ?? 0}
                        chargeRateCents={member.chargeRateCents ?? 0}
                        employmentType={(member.employmentType as "employee" | "subcontractor") ?? "employee"}
                        trade={member.trade ?? ""}
                        standardHoursPerWeek={member.standardHoursPerWeek ?? 38}
                        abn={member.abn ?? ""}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
