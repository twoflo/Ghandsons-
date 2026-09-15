"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/modules/auth/actions";
import { Alert, Field, Input, Button } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(loginAction, null);

  useEffect(() => {
    if (state?.ok) router.replace(state.data.redirectTo);
  }, [state, router]);

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state && !state.ok ? <Alert tone="bad">{state.message}</Alert> : null}

      <input type="hidden" name="redirectTo" value={redirectTo ?? ""} />

      <Field label="Email" htmlFor="email" error={fieldErrors?.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          placeholder="you@example.com.au"
        />
      </Field>

      <Field label="Password" htmlFor="password" error={fieldErrors?.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Your password"
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
