"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, ne, and } from "drizzle-orm";
import { db } from "@/db";
import {
  businessSettings, taxRates, numberSequences, jobTypes, expenseCategories,
  priceBookItems, emailTemplates, users, workerProfiles,
} from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit, diffFields } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { fail, ok } from "@/lib/result";
import { moneyField } from "@/modules/jobs/validation";

const text = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

/* ---------------------------- business details ---------------------------- */

const BusinessSchema = z.object({
  tradingName: z.string().trim().min(2, "What's the business called?"),
  legalName: text(200),
  abn: text(20),
  acn: text(20),
  licenceNumber: text(60),
  email: text(200),
  phone: text(40),
  website: text(200),
  addressLine1: text(200),
  suburb: text(120),
  state: text(20),
  postcode: text(10),
  timezone: z.string().trim().max(60).default("Australia/Brisbane"),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12).default(7),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(120).default(14),
  defaultMarkupBp: z.coerce.number().int().min(0).max(100_000).default(2000),
  quoteValidDays: z.coerce.number().int().min(1).max(365).default(30),
  bankAccountName: text(200),
  bankBsb: text(20),
  bankAccountNumber: text(40),
  invoiceFooter: text(2000),
  quoteTerms: text(8000),
  logoFileId: z.string().uuid().nullable().optional(),
});

export const saveBusinessSettings = action("settings.manage", BusinessSchema, async (input, user) => {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(businessSettings).limit(1);

    if (before) {
      await tx
        .update(businessSettings)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(businessSettings.id, before.id));
    } else {
      await tx.insert(businessSettings).values({ id: "default", ...input });
    }

    await recordAudit(tx, {
      entityType: "settings",
      entityId: "00000000-0000-0000-0000-000000000000",
      action: "update",
      summary: "Changed the business details",
      actorUserId: user.id,
      actorLabel: user.fullName,
      changes: before
        ? diffFields(before as never, input as never, [
            "tradingName", "abn", "defaultPaymentTermsDays", "defaultMarkupBp", "bankBsb",
          ])
        : null,
    });
  });

  revalidatePath("/settings");
  return ok(undefined, "Saved. It'll show on your next quote and invoice.");
});

/* -------------------------------- numbering -------------------------------- */

const NumberingSchema = z.object({
  key: z.enum(["job", "quote", "invoice", "purchase_order", "variation", "expense", "incident"]),
  prefix: z.string().trim().max(10),
  nextValue: z.coerce.number().int().min(1).max(9_999_999),
  padding: z.coerce.number().int().min(0).max(8),
});

/**
 * Changing the next number is allowed, but never downwards past one already
 * used — a reused invoice number is a real problem at audit time.
 */
export const saveNumbering = action("settings.manage", NumberingSchema, async (input, user) => {
  const [existing] = await db
    .select()
    .from(numberSequences)
    .where(eq(numberSequences.key, input.key))
    .limit(1);

  if (existing && input.nextValue < existing.nextValue) {
    return fail(
      `${existing.prefix}${String(input.nextValue).padStart(existing.padding, "0")} onwards may already be used. You can only move the next number forward.`,
      { nextValue: "Can't go backwards." },
    );
  }

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(numberSequences)
        .set({ prefix: input.prefix, nextValue: input.nextValue, padding: input.padding, updatedAt: new Date() })
        .where(eq(numberSequences.key, input.key));
    } else {
      await tx.insert(numberSequences).values(input);
    }
    await recordAudit(tx, {
      entityType: "settings",
      entityId: "00000000-0000-0000-0000-000000000000",
      action: "update",
      summary: `Changed ${input.key} numbering — next is ${input.prefix}${String(input.nextValue).padStart(input.padding, "0")}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/settings/numbering");
  return ok(undefined, "Numbering updated.");
});

/* -------------------------------- tax rates -------------------------------- */

const TaxRateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Give it a name."),
  code: z.string().trim().min(1, "Give it a short code.").max(10),
  rateBp: z.coerce.number().int().min(0).max(10_000),
  isDefault: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
});

export const saveTaxRate = action("settings.manage", TaxRateSchema, async (input, user) => {
  await db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(taxRates)
        .set({ isDefault: false })
        .where(input.id ? ne(taxRates.id, input.id) : and());
    }
    if (input.id) {
      await tx.update(taxRates).set({ ...input, updatedAt: new Date() }).where(eq(taxRates.id, input.id));
    } else {
      await tx.insert(taxRates).values(input);
    }
    await recordAudit(tx, {
      entityType: "settings",
      entityId: "00000000-0000-0000-0000-000000000000",
      action: "update",
      summary: `${input.id ? "Updated" : "Added"} tax rate ${input.name} at ${input.rateBp / 100}%`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/settings/tax");
  return ok(undefined, "Saved. Existing quotes and invoices keep the rate they were written at.");
});

/* -------------------------------- categories ------------------------------- */

const CategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Give it a name."),
  kind: z.enum(["labour", "material", "subcontractor", "plant", "other"]),
  defaultBillable: z.coerce.boolean().default(true),
  gstApplicable: z.coerce.boolean().default(true),
  matchKeywords: z.string().trim().max(500).optional(),
  isActive: z.coerce.boolean().default(true),
});

export const saveExpenseCategory = action("settings.manage", CategorySchema, async (input, user) => {
  const keywords = (input.matchKeywords ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  await db.transaction(async (tx) => {
    const values = {
      name: input.name,
      kind: input.kind,
      defaultBillable: input.defaultBillable,
      gstApplicable: input.gstApplicable,
      matchKeywords: keywords,
      isActive: input.isActive,
      updatedAt: new Date(),
    };
    if (input.id) {
      await tx.update(expenseCategories).set(values).where(eq(expenseCategories.id, input.id));
    } else {
      await tx.insert(expenseCategories).values(values);
    }
    await recordAudit(tx, {
      entityType: "settings",
      entityId: "00000000-0000-0000-0000-000000000000",
      action: "update",
      summary: `${input.id ? "Updated" : "Added"} expense category ${input.name}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/settings/categories");
  return ok(undefined, "Saved.");
});

const JobTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Give it a name."),
  colour: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour."),
  defaultMarkupBp: z.coerce.number().int().min(0).max(100_000).default(2000),
  isActive: z.coerce.boolean().default(true),
});

export const saveJobType = action("settings.manage", JobTypeSchema, async (input, user) => {
  await db.transaction(async (tx) => {
    if (input.id) {
      await tx.update(jobTypes).set({ ...input, updatedAt: new Date() }).where(eq(jobTypes.id, input.id));
    } else {
      await tx.insert(jobTypes).values(input);
    }
    await recordAudit(tx, {
      entityType: "settings",
      entityId: "00000000-0000-0000-0000-000000000000",
      action: "update",
      summary: `${input.id ? "Updated" : "Added"} job type ${input.name}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });
  revalidatePath("/settings/categories");
  return ok(undefined, "Saved.");
});

/* -------------------------------- price book ------------------------------- */

const PriceBookSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(2, "Give it a short code.").max(30),
  name: z.string().trim().min(2, "Give it a name."),
  description: text(500),
  kind: z.enum(["labour", "material", "subcontractor", "plant", "other"]),
  unit: z.string().trim().max(20).default("ea"),
  unitCostCents: moneyField,
  defaultMarkupBp: z.coerce.number().int().min(0).max(100_000).default(2000),
  taxRateId: z.string().uuid().nullable().optional().or(z.literal("")).transform((v) => v || null),
  isActive: z.coerce.boolean().default(true),
});

export const savePriceBookItem = action("settings.manage", PriceBookSchema, async (input, user) => {
  await db.transaction(async (tx) => {
    if (input.id) {
      await tx.update(priceBookItems).set({ ...input, updatedAt: new Date() }).where(eq(priceBookItems.id, input.id));
    } else {
      await tx.insert(priceBookItems).values(input);
    }
    await recordAudit(tx, {
      entityType: "settings",
      entityId: "00000000-0000-0000-0000-000000000000",
      action: "update",
      summary: `${input.id ? "Updated" : "Added"} price book item ${input.code} — ${input.name}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });
  revalidatePath("/settings/price-book");
  return ok(undefined, "Saved. Quotes written before now keep their old prices.");
});

/* ---------------------------------- users ---------------------------------- */

const UserSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(2, "What's their name?"),
  email: z.string().trim().email("That doesn't look like an email address.").toLowerCase(),
  phone: text(40),
  role: z.enum(["owner", "office", "field"]),
  isActive: z.coerce.boolean().default(true),
  password: z.string().optional(),
});

export const saveUser = action("users.manage", UserSchema, async (input, user) => {
  if (input.id === user.id && input.role !== "owner") {
    return fail("You can't take away your own owner access — you'd lock yourself out.");
  }
  if (input.id === user.id && !input.isActive) {
    return fail("You can't switch off your own account.");
  }

  if (!input.id && (!input.password || input.password.length < 10)) {
    return fail("Set a starting password of at least 10 characters.", {
      password: "At least 10 characters.",
    });
  }
  if (input.password && input.password.length > 0 && input.password.length < 10) {
    return fail("A password needs at least 10 characters.", { password: "At least 10 characters." });
  }

  const id = await db.transaction(async (tx) => {
    if (input.id) {
      const patch: Record<string, unknown> = {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        role: input.role,
        isActive: input.isActive,
        updatedAt: new Date(),
      };
      if (input.password) {
        patch.passwordHash = await hashPassword(input.password);
        patch.mustChangePassword = true;
      }
      await tx.update(users).set(patch).where(eq(users.id, input.id));

      await recordAudit(tx, {
        entityType: "user",
        entityId: input.id,
        action: "update",
        summary: `Updated ${input.fullName} (${input.role})${input.password ? " and reset their password" : ""}`,
        actorUserId: user.id,
        actorLabel: user.fullName,
      });
      return input.id;
    }

    const [created] = await tx
      .insert(users)
      .values({
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        role: input.role,
        isActive: input.isActive,
        passwordHash: await hashPassword(input.password!),
        mustChangePassword: true,
      })
      .returning({ id: users.id });

    await tx.insert(workerProfiles).values({ userId: created!.id }).onConflictDoNothing();

    await recordAudit(tx, {
      entityType: "user",
      entityId: created!.id,
      action: "create",
      summary: `Added ${input.fullName} as ${input.role}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
    return created!.id;
  });

  revalidatePath("/settings/users");
  revalidatePath("/crew");
  return ok(
    { id },
    input.id
      ? "Saved."
      : `${input.fullName} can sign in with that password — they'll be asked to change it.`,
  );
});

/* ------------------------------ email templates ---------------------------- */

const TemplateSchema = z.object({
  id: z.string().uuid(),
  subject: z.string().trim().min(2, "Give it a subject line."),
  body: z.string().trim().min(10, "Write the message."),
});

export const saveEmailTemplate = action("settings.manage", TemplateSchema, async (input, user) => {
  await db
    .update(emailTemplates)
    .set({ subject: input.subject, body: input.body, updatedAt: new Date() })
    .where(eq(emailTemplates.id, input.id));

  void user;
  revalidatePath("/settings/templates");
  return ok(undefined, "Saved.");
});
