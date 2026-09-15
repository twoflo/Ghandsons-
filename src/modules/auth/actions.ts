"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { attemptLogin, destroySession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { describeError, flattenZod } from "@/lib/actions";
import { fail, ok, type ActionResult } from "@/lib/result";

const LoginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").email("That doesn't look like an email address."),
  password: z.string().min(1, "Enter your password."),
  redirectTo: z.string().optional(),
});

export async function loginAction(_prev: unknown, formData: FormData): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirectTo: formData.get("redirectTo"),
  });

  if (!parsed.success) {
    return fail("Please check the highlighted fields.", flattenZod(parsed.error));
  }

  try {
    const result = await attemptLogin(parsed.data.email, parsed.data.password);
    if (!result.ok) return fail(result.message);

    await audit({
      entityType: "user",
      entityId: result.user.id,
      action: "update",
      summary: `${result.user.fullName} signed in`,
      actorUserId: result.user.id,
      actorLabel: result.user.fullName,
    });

    const target = parsed.data.redirectTo?.startsWith("/") ? parsed.data.redirectTo : "/dashboard";
    return ok({ redirectTo: target });
  } catch (error) {
    return fail(describeError(error));
  }
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(10, "Use at least 10 characters — a short sentence works well.")
      .max(200, "That's too long."),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "The two new passwords don't match.",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<void>> {
  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) return fail("Please check the highlighted fields.", flattenZod(parsed.error));

  try {
    const user = await requireUser();
    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const row = rows[0];
    if (!row) return fail("We couldn't find your account.");

    if (!(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
      return fail("Your current password isn't right.", { currentPassword: "Wrong password." });
    }

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.newPassword),
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await audit({
      entityType: "user",
      entityId: user.id,
      action: "update",
      summary: `${user.fullName} changed their password`,
      actorUserId: user.id,
      actorLabel: user.fullName,
    });

    return ok(undefined, "Password changed.");
  } catch (error) {
    return fail(describeError(error));
  }
}
