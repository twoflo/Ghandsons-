import { pgTable, text, uuid, integer, boolean, index, timestamp } from "drizzle-orm/pg-core";
import { pk, timestamps, clientType, addressColumns, interactionKind } from "./_shared";
import { users } from "./auth";

export const clients = pgTable(
  "clients",
  {
    id: pk(),
    name: text("name").notNull(),
    type: clientType("type").notNull().default("individual"),
    abn: text("abn"),
    email: text("email"),
    phone: text("phone"),
    /** Where invoices go — sites live in their own table. */
    ...addressColumns,
    paymentTermsDays: integer("payment_terms_days"),
    /** Stop new work when the client is over terms. */
    onHold: boolean("on_hold").notNull().default(false),
    notes: text("notes"),
    source: text("source"), // 'referral' | 'repeat' | 'web' | 'signage' | ...
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("clients_name_idx").on(t.name)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: pk(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("contacts_client_idx").on(t.clientId)],
);

/** A client can own several sites; a job always happens at exactly one. */
export const sites = pgTable(
  "sites",
  {
    id: pk(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    label: text("label").notNull(),
    ...addressColumns,
    latitude: text("latitude"),
    longitude: text("longitude"),
    accessNotes: text("access_notes"),
    parkingNotes: text("parking_notes"),
    hazardNotes: text("hazard_notes"),
    ...timestamps,
  },
  (t) => [index("sites_client_idx").on(t.clientId)],
);

/** Contact history: calls, emails, site visits. Optionally tied to a job. */
export const interactions = pgTable(
  "interactions",
  {
    id: pk(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    jobId: uuid("job_id"),
    kind: interactionKind("kind").notNull().default("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    summary: text("summary").notNull(),
    detail: text("detail"),
    followUpOn: text("follow_up_on"),
    userId: uuid("user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("interactions_client_idx").on(t.clientId),
    index("interactions_job_idx").on(t.jobId),
  ],
);
