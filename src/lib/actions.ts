import "server-only";
import { z } from "zod";
import { AuthError, requirePermission, type SessionUser } from "./auth";
import type { Permission } from "./permissions";
import { fail, type ActionResult } from "./result";

/**
 * Wraps a server action with: permission check, zod validation of the raw
 * form data, and error translation. Nothing reaches the database without
 * passing all three.
 *
 *   export const saveClient = action("clients.manage", ClientSchema,
 *     async (input, user) => { ... });
 */
export function action<S extends z.ZodTypeAny, R>(
  permission: Permission,
  schema: S,
  handler: (input: z.output<S>, user: SessionUser) => Promise<ActionResult<R>>,
) {
  return async (raw: unknown): Promise<ActionResult<R>> => {
    let user: SessionUser;
    try {
      user = await requirePermission(permission);
    } catch (error) {
      return fail(
        error instanceof AuthError ? error.message : "Something went wrong signing you in.",
      );
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return fail("Please check the highlighted fields.", flattenZod(parsed.error));
    }

    try {
      return await handler(parsed.data, user);
    } catch (error) {
      return fail(describeError(error));
    }
  };
}

export function flattenZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Turns database and runtime errors into something a builder can read.
 * Anything unrecognised is logged server-side and reported generically —
 * we never leak a constraint name to the screen.
 */
export function describeError(error: unknown): string {
  if (error instanceof AuthError) return error.message;

  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("invoices_balance_consistent"))
    return "The invoice totals didn't add up. Refresh the page and try again.";
  if (message.includes("expenses_totals_consistent"))
    return "Subtotal plus GST has to equal the total. Check the amounts.";
  if (message.includes("time_entries_one_open_per_user"))
    return "You're already clocked on. Clock off first, then start the new job.";
  if (message.includes("expenses_billed_once"))
    return "That expense has already been added to an invoice.";
  if (message.includes("users_email_lower_uq") || message.includes("users_email_unique"))
    return "There's already an account using that email address.";
  if (message.includes("duplicate key"))
    return "That already exists. Check the list before adding it again.";
  if (message.includes("violates foreign key"))
    return "Something it links to is missing. Refresh the page and try again.";
  if (message.includes("audit_log is append-only"))
    return "Financial history can't be edited. That's on purpose.";

  console.error("[action error]", error);
  return "Something went wrong saving that. Nothing was changed — please try again.";
}
