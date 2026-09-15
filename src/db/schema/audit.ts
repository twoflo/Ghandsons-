import { pgTable, text, uuid, jsonb, index, timestamp, integer } from "drizzle-orm/pg-core";
import { pk, auditAction } from "./_shared";
import { users } from "./auth";

/**
 * Append-only financial audit trail. Written by `recordAudit()` inside the
 * same transaction as the change it describes, so a money row can never move
 * without a matching entry. Nothing in the app updates or deletes these rows.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: pk(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: auditAction("action").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorLabel: text("actor_label"),
    /** Human sentence for the timeline: "Marked invoice INV-0042 as sent". */
    summary: text("summary").notNull(),
    /** Only the fields that changed, as { field: { from, to } }. */
    changes: jsonb("changes"),
    /** Amount involved, in cents, when the event is monetary. */
    amountCents: integer("amount_cents"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_created_idx").on(t.createdAt),
    index("audit_actor_idx").on(t.actorUserId),
  ],
);
