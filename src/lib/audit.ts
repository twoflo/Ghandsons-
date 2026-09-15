import { db, type DbOrTx } from "@/db";
import { auditLog } from "@/db/schema";

type AuditAction =
  | "create" | "update" | "delete" | "restore"
  | "status_change" | "send" | "payment" | "approve" | "reject";

export type AuditInput = {
  entityType: string;
  entityId: string;
  action: AuditAction;
  summary: string;
  actorUserId?: string | null;
  actorLabel?: string | null;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  amountCents?: number | null;
  ipAddress?: string | null;
};

/**
 * Writes one immutable line to the financial audit trail.
 *
 * Always pass the same transaction the change is running in — the trail and
 * the change then commit or roll back together, so there can be no money
 * movement without a matching entry (and no phantom entry either).
 */
export async function recordAudit(tx: DbOrTx, input: AuditInput): Promise<void> {
  await tx.insert(auditLog).values({
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    actorLabel: input.actorLabel ?? null,
    summary: input.summary,
    changes: input.changes ?? null,
    amountCents: input.amountCents ?? null,
    ipAddress: input.ipAddress ?? null,
  });
}

/** Convenience for the non-transactional case (reads, sends, exports). */
export async function audit(input: AuditInput): Promise<void> {
  await recordAudit(db, input);
}

/**
 * Field-level diff for the `changes` column. Only keys whose value actually
 * moved are recorded, so the trail reads as "what changed", not "what was
 * submitted".
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T)[],
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    if (!(field in after)) continue;
    const from = before[field];
    const to = after[field];
    const same =
      from === to ||
      (from instanceof Date && to instanceof Date && from.getTime() === to.getTime()) ||
      (from == null && to == null);
    if (!same) changes[String(field)] = { from: normalise(from), to: normalise(to) };
  }
  return Object.keys(changes).length ? changes : null;
}

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}
