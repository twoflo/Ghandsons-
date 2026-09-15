import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Card, CardHeader, Badge, Input, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Audit trail" };
export const dynamic = "force-dynamic";

const ACTION_TONE: Record<string, "neutral" | "good" | "warn" | "bad" | "info"> = {
  create: "good",
  update: "info",
  delete: "bad",
  restore: "good",
  status_change: "info",
  send: "info",
  payment: "good",
  approve: "good",
  reject: "warn",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "audit.view")) redirect("/settings");

  const { q } = await searchParams;
  const search = q?.trim();

  const entries = (await db.execute(sql`
    SELECT a.id, a.entity_type AS "entityType", a.entity_id AS "entityId",
           a.action::text AS action, a.summary, a.amount_cents AS "amountCents",
           a.created_at::text AS "createdAt",
           COALESCE(u.full_name, a.actor_label, 'System') AS actor
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.actor_user_id
    ${search ? sql`WHERE a.summary ILIKE ${"%" + search + "%"}` : sql``}
    ORDER BY a.created_at DESC
    LIMIT 300
  `)) as unknown as Array<{
    id: string; entityType: string; entityId: string; action: string;
    summary: string; amountCents: number | null; createdAt: string; actor: string;
  }>;

  return (
    <Card>
      <CardHeader
        title="Audit trail"
        subtitle="Everything that touched money, who did it and when. Append-only — the database refuses to change these."
        action={
          <a
            href="/api/export?dataset=audit"
            className="text-sm font-bold text-info-700 underline"
          >
            Export
          </a>
        }
      />
      <div className="border-b border-ink-200 p-4">
        <form method="get">
          <Input type="search" name="q" defaultValue={q ?? ""} placeholder="Search the trail…"
                 aria-label="Search the audit trail" enterKeyHint="search" />
        </form>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon="📜" title="Nothing here" body="Nothing matched that search." />
      ) : (
        <ol className="divide-y divide-ink-200">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-4 py-2.5">
              <Badge tone={ACTION_TONE[entry.action] ?? "neutral"}>{entry.action.replace("_", " ")}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-ink-900">{entry.summary}</p>
                <p className="text-xs text-ink-500">
                  {formatDateTime(entry.createdAt)} · {entry.actor} · {entry.entityType}
                </p>
              </div>
              {entry.amountCents !== null ? (
                <span className="tabular shrink-0 text-sm font-bold text-ink-700">
                  {formatMoney(entry.amountCents)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
