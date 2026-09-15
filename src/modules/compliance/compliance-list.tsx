"use client";

import { useState } from "react";
import { ComplianceForm } from "./compliance-form";
import { Button, Card, CardHeader, Badge, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { ComplianceItem } from "./queries";

const STATE_TONE = {
  expired: "bad",
  due: "warn",
  ok: "good",
  no_expiry: "neutral",
} as const;

export function ComplianceList({
  items,
  workers,
  suppliers,
  canManage,
}: {
  items: ComplianceItem[];
  workers: Array<{ id: string; fullName: string }>;
  suppliers: Array<{ id: string; name: string }>;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const bySubject = new Map<string, ComplianceItem[]>();
  for (const item of items) {
    bySubject.set(item.subjectLabel, [...(bySubject.get(item.subjectLabel) ?? []), item]);
  }

  return (
    <div className="space-y-5">
      {canManage && editing !== "new" ? (
        <Button onClick={() => setEditing("new")}>+ Record a licence or insurance</Button>
      ) : null}

      {editing === "new" ? (
        <ComplianceForm workers={workers} suppliers={suppliers} onDone={() => setEditing(null)} />
      ) : null}

      {items.length === 0 && editing !== "new" ? (
        <Card>
          <EmptyState
            icon="🛡️"
            title="Nothing recorded"
            body="Your QBCC licence, public liability, workers comp, everyone's white cards. Put the expiry dates in and you'll be warned before they lapse."
          />
        </Card>
      ) : null}

      {[...bySubject.entries()].map(([subject, subjectItems]) => (
        <Card key={subject}>
          <CardHeader
            title={subject}
            subtitle={`${subjectItems.length} record${subjectItems.length === 1 ? "" : "s"}`}
            action={
              subjectItems.some((i) => i.state === "expired") ? (
                <Badge tone="bad">Something&apos;s expired</Badge>
              ) : subjectItems.some((i) => i.state === "due") ? (
                <Badge tone="warn">Renewal due</Badge>
              ) : (
                <Badge tone="good">All current</Badge>
              )
            }
          />
          <ul className="divide-y divide-ink-200">
            {subjectItems.map((item) =>
              editing === item.id ? (
                <li key={item.id} className="p-3">
                  <ComplianceForm
                    item={item}
                    workers={workers}
                    suppliers={suppliers}
                    onDone={() => setEditing(null)}
                  />
                </li>
              ) : (
                <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{item.name}</p>
                    <p className="text-sm text-ink-600">
                      {[item.identifier, item.issuer].filter(Boolean).join(" · ") || "No details"}
                      {item.coverageCents ? ` · ${formatMoney(item.coverageCents)} cover` : ""}
                    </p>
                    {item.expiryDate ? (
                      <p className="text-sm text-ink-500">
                        {item.state === "expired"
                          ? `Expired ${formatDate(item.expiryDate)}`
                          : `Expires ${formatDate(item.expiryDate)}`}
                      </p>
                    ) : null}
                    {item.notes ? <p className="mt-1 text-sm text-ink-600">{item.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={STATE_TONE[item.state]}>
                      {item.state === "expired"
                        ? `${Math.abs(item.daysLeft ?? 0)}d overdue`
                        : item.state === "due"
                          ? `${item.daysLeft}d left`
                          : item.state === "ok"
                            ? "Current"
                            : "No expiry"}
                    </Badge>
                    <div className="flex gap-2">
                      {item.fileId ? (
                        <a
                          href={`/api/files/${item.fileId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-bold text-info-700 underline"
                        >
                          Certificate
                        </a>
                      ) : null}
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setEditing(item.id)}
                          className="text-sm font-bold text-ink-500 underline"
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ),
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}
