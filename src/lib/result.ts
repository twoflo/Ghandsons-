/**
 * Every server action returns one of these. The UI never sees a stack trace —
 * it sees a sentence the owner can act on.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(message: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, message, fieldErrors };
}

export const EMPTY_RESULT: ActionResult<void> = { ok: true, data: undefined };
