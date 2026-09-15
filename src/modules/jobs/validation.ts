import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/** ISO date from <input type="date">, or empty. */
export const dateField = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a real date.")
  .transform((v) => (v ? v : null));

/**
 * Money arrives from the browser as a string in dollars. It is parsed and
 * bounded here, on the server, before anything touches the database — the
 * client-side formatting is a convenience, never the validation.
 */
export const moneyField = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return 0;
    const text = typeof v === "number" ? String(v) : v;
    const cleaned = text.replace(/[$,\s]/g, "");
    const value = Number.parseFloat(cleaned);
    return Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
  })
  .refine((v) => Number.isFinite(v), "Enter an amount like 1250 or 1250.50.")
  .refine((v) => v >= 0, "That can't be a negative amount.")
  .refine((v) => v <= 100_000_000_00, "That's over $100 million — check the amount.");

export const JobSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3, "Give the job a name you'll recognise on a list."),
  clientId: z.string().uuid("Pick a client."),
  siteId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  jobTypeId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  status: z.enum([
    "lead", "quoted", "won", "scheduled", "in_progress",
    "complete", "invoiced", "paid", "lost", "cancelled",
  ]),
  description: optionalText(4000),
  notes: optionalText(4000),
  leadSource: optionalText(200),
  lostReason: optionalText(500),
  startDate: dateField,
  endDate: dateField,
  isPriority: z.coerce.boolean().default(false),
  contractValueCents: moneyField,
  budgetLabourCents: moneyField,
  budgetMaterialCents: moneyField,
  budgetSubcontractorCents: moneyField,
  budgetPlantCents: moneyField,
  budgetOtherCents: moneyField,
}).refine(
  (v) => !v.startDate || !v.endDate || v.endDate >= v.startDate,
  { message: "The finish date is before the start date.", path: ["endDate"] },
);

export type JobInput = z.output<typeof JobSchema>;

export const JobStatusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum([
    "lead", "quoted", "won", "scheduled", "in_progress",
    "complete", "invoiced", "paid", "lost", "cancelled",
  ]),
  note: optionalText(500),
});

export const JobNoteSchema = z.object({
  jobId: z.string().uuid(),
  body: z.string().trim().min(1, "Write something first.").max(4000),
  pinned: z.coerce.boolean().default(false),
});

export const JobCrewSchema = z.object({
  jobId: z.string().uuid(),
  userIds: z.array(z.string().uuid()).default([]),
});
