"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePasswordAction } from "./actions";
import { Alert, Button, Field, Input } from "@/components/ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Changing…" : "Change password"}
    </Button>
  );
}

export function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const [state, formAction] = useActionState(changePasswordAction, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {mustChange ? (
        <Alert tone="warn" title="Set your own password">
          You&apos;re still on the one you were given. Change it to something only you know.
        </Alert>
      ) : null}
      {state && !state.ok ? <Alert tone="bad">{state.message}</Alert> : null}
      {state?.ok ? <Alert tone="good">{state.message ?? "Password changed."}</Alert> : null}

      <Field label="Current password" htmlFor="currentPassword" error={fieldErrors?.currentPassword} required>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="newPassword" error={fieldErrors?.newPassword} required
             hint="At least 10 characters.">
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="New password again" htmlFor="confirmPassword" error={fieldErrors?.confirmPassword} required>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <Submit />
    </form>
  );
}
