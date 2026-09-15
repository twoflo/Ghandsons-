import { pgTable, text, boolean, uuid, integer, jsonb, index, unique, timestamp } from "drizzle-orm/pg-core";
import { pk, timestamps, bp, lineKind } from "./_shared";

/** Singleton row (id = 'default'). Business identity + document defaults. */
export const businessSettings = pgTable("business_settings", {
  id: text("id").primaryKey().default("default"),
  tradingName: text("trading_name").notNull(),
  legalName: text("legal_name"),
  abn: text("abn"),
  acn: text("acn"),
  licenceNumber: text("licence_number"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  suburb: text("suburb"),
  state: text("state"),
  postcode: text("postcode"),
  country: text("country").notNull().default("Australia"),
  logoFileId: uuid("logo_file_id"),
  currency: text("currency").notNull().default("AUD"),
  locale: text("locale").notNull().default("en-AU"),
  timezone: text("timezone").notNull().default("Australia/Brisbane"),
  /** Month the financial year starts. 7 = July (Australia). */
  financialYearStartMonth: integer("financial_year_start_month").notNull().default(7),
  defaultPaymentTermsDays: integer("default_payment_terms_days").notNull().default(14),
  defaultMarkupBp: bp("default_markup_bp"),
  quoteValidDays: integer("quote_valid_days").notNull().default(30),
  bankAccountName: text("bank_account_name"),
  bankBsb: text("bank_bsb"),
  bankAccountNumber: text("bank_account_number"),
  invoiceFooter: text("invoice_footer"),
  quoteTerms: text("quote_terms"),
  ...timestamps,
});

/** GST and any other rate. rateBp 1000 = 10%. */
export const taxRates = pgTable("tax_rates", {
  id: pk(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  rateBp: bp("rate_bp"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

/**
 * Gapless-ish document numbering. Incremented inside the same transaction as
 * the document insert via `SELECT ... FOR UPDATE`, so two concurrent invoices
 * can never take the same number.
 */
export const numberSequences = pgTable("number_sequences", {
  key: text("key").primaryKey(), // 'job' | 'quote' | 'invoice' | 'purchase_order' | 'variation' | 'expense'
  prefix: text("prefix").notNull().default(""),
  nextValue: integer("next_value").notNull().default(1),
  padding: integer("padding").notNull().default(4),
  ...timestamps,
});

export const jobTypes = pgTable("job_types", {
  id: pk(),
  name: text("name").notNull(),
  colour: text("colour").notNull().default("#64748b"),
  defaultMarkupBp: bp("default_markup_bp"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const expenseCategories = pgTable("expense_categories", {
  id: pk(),
  name: text("name").notNull(),
  kind: lineKind("kind").notNull().default("material"),
  /** Default for the "billable to client" toggle on new expenses. */
  defaultBillable: boolean("default_billable").notNull().default(true),
  gstApplicable: boolean("gst_applicable").notNull().default(true),
  /** Free-text hints the receipt extractor uses to suggest this category. */
  matchKeywords: text("match_keywords").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const priceBookItems = pgTable(
  "price_book_items",
  {
    id: pk(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    kind: lineKind("kind").notNull().default("material"),
    unit: text("unit").notNull().default("ea"),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    defaultMarkupBp: bp("default_markup_bp"),
    taxRateId: uuid("tax_rate_id").references(() => taxRates.id),
    supplierId: uuid("supplier_id"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [unique("price_book_code_uq").on(t.code), index("price_book_kind_idx").on(t.kind)],
);

export const emailTemplates = pgTable("email_templates", {
  id: pk(),
  key: text("key").notNull().unique(), // 'quote_send' | 'invoice_send' | 'invoice_overdue' | ...
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  ...timestamps,
});

/** In-app reminders surfaced on the dashboard (expiries, overdue invoices, review queue). */
export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    userId: uuid("user_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    severity: text("severity").notNull().default("info"), // info | warning | danger
    meta: jsonb("meta"),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);
