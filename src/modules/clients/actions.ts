"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, contacts, sites, interactions } from "@/db/schema";
import { action } from "@/lib/actions";
import { recordAudit, diffFields } from "@/lib/audit";
import { fail, ok } from "@/lib/result";

const text = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const ClientSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Enter the client's name."),
  type: z.enum(["individual", "company"]).default("individual"),
  abn: text(20),
  email: z.string().trim().max(200).optional()
    .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "That doesn't look like an email address.")
    .transform((v) => (v ? v : null)),
  phone: text(40),
  addressLine1: text(200),
  addressLine2: text(200),
  suburb: text(120),
  state: text(20),
  postcode: text(10),
  paymentTermsDays: z.coerce.number().int().min(0).max(120).optional(),
  onHold: z.coerce.boolean().default(false),
  notes: text(4000),
  source: text(120),
});

export const saveClient = action("clients.manage", ClientSchema, async (input, user) => {
  const id = await db.transaction(async (tx) => {
    const values = {
      name: input.name,
      type: input.type,
      abn: input.abn,
      email: input.email,
      phone: input.phone,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      suburb: input.suburb,
      state: input.state,
      postcode: input.postcode,
      paymentTermsDays: input.paymentTermsDays ?? null,
      onHold: input.onHold,
      notes: input.notes,
      source: input.source,
    };

    if (input.id) {
      const [before] = await tx.select().from(clients).where(eq(clients.id, input.id)).limit(1);
      if (!before) throw new Error("That client no longer exists.");

      await tx.update(clients).set({ ...values, updatedAt: new Date() }).where(eq(clients.id, input.id));

      await recordAudit(tx, {
        entityType: "client",
        entityId: input.id,
        action: "update",
        summary: `Updated client ${input.name}`,
        actorUserId: user.id,
        actorLabel: user.fullName,
        changes: diffFields(before as never, values as never, [
          "name", "email", "phone", "paymentTermsDays", "onHold", "abn",
        ]),
      });
      return input.id;
    }

    const [created] = await tx
      .insert(clients)
      .values({ ...values, createdBy: user.id })
      .returning({ id: clients.id });

    await recordAudit(tx, {
      entityType: "client",
      entityId: created!.id,
      action: "create",
      summary: `Added client ${input.name}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
    return created!.id;
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return ok({ id }, input.id ? "Client saved." : "Client added.");
});

const ContactSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  name: z.string().trim().min(2, "Enter a name."),
  role: text(120),
  email: text(200),
  phone: text(40),
  isPrimary: z.coerce.boolean().default(false),
});

export const saveContact = action("clients.manage", ContactSchema, async (input, user) => {
  await db.transaction(async (tx) => {
    if (input.isPrimary) {
      // Only one primary contact per client.
      await tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.clientId, input.clientId));
    }
    if (input.id) {
      await tx.update(contacts).set({
        name: input.name, role: input.role, email: input.email,
        phone: input.phone, isPrimary: input.isPrimary, updatedAt: new Date(),
      }).where(eq(contacts.id, input.id));
    } else {
      await tx.insert(contacts).values({
        clientId: input.clientId, name: input.name, role: input.role,
        email: input.email, phone: input.phone, isPrimary: input.isPrimary,
      });
    }
    await recordAudit(tx, {
      entityType: "client",
      entityId: input.clientId,
      action: input.id ? "update" : "create",
      summary: `${input.id ? "Updated" : "Added"} contact ${input.name}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath(`/clients/${input.clientId}`);
  return ok(undefined, "Contact saved.");
});

const SiteSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  label: z.string().trim().min(2, "Give the site a short name, like “Home — Bardon”."),
  addressLine1: text(200),
  suburb: text(120),
  state: text(20),
  postcode: text(10),
  accessNotes: text(2000),
  parkingNotes: text(2000),
  hazardNotes: text(2000),
});

export const saveSite = action("clients.manage", SiteSchema, async (input, user) => {
  await db.transaction(async (tx) => {
    const values = {
      label: input.label,
      addressLine1: input.addressLine1,
      suburb: input.suburb,
      state: input.state,
      postcode: input.postcode,
      accessNotes: input.accessNotes,
      parkingNotes: input.parkingNotes,
      hazardNotes: input.hazardNotes,
    };
    if (input.id) {
      await tx.update(sites).set({ ...values, updatedAt: new Date() }).where(eq(sites.id, input.id));
    } else {
      await tx.insert(sites).values({ clientId: input.clientId, ...values });
    }
    await recordAudit(tx, {
      entityType: "client",
      entityId: input.clientId,
      action: input.id ? "update" : "create",
      summary: `${input.id ? "Updated" : "Added"} site ${input.label}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath(`/clients/${input.clientId}`);
  return ok(undefined, "Site saved.");
});

const InteractionSchema = z.object({
  clientId: z.string().uuid(),
  jobId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  kind: z.enum(["call", "email", "sms", "meeting", "site_visit", "note"]).default("note"),
  summary: z.string().trim().min(2, "What happened?").max(300),
  detail: text(4000),
});

export const logInteraction = action("clients.manage", InteractionSchema, async (input, user) => {
  await db.insert(interactions).values({
    clientId: input.clientId,
    jobId: input.jobId,
    kind: input.kind,
    summary: input.summary,
    detail: input.detail,
    userId: user.id,
  });
  revalidatePath(`/clients/${input.clientId}`);
  return ok(undefined, "Logged.");
});

const ArchiveSchema = z.object({ clientId: z.string().uuid() });

export const archiveClient = action("clients.delete", ArchiveSchema, async (input, user) => {
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
  if (!client) return fail("That client no longer exists.");

  await db.transaction(async (tx) => {
    await tx.update(clients).set({ deletedAt: new Date() }).where(eq(clients.id, input.clientId));
    await recordAudit(tx, {
      entityType: "client",
      entityId: input.clientId,
      action: "delete",
      summary: `Archived client ${client.name}`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });
  });

  revalidatePath("/clients");
  return ok(undefined, "Client archived. Their jobs and invoices are untouched.");
});
