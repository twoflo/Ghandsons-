"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveExpense } from "./actions";
import { Button, Alert } from "@/components/ui";

export function ArchiveExpenseButton({ expenseId, canDelete }: { expenseId: string; canDelete: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canDelete) return null;

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Archive
      </Button>
    );
  }

  return (
    <div className="w-64 rounded-lg border-2 border-bad-600 bg-bad-50 p-3 text-left">
      <p className="text-sm text-ink-800">
        Archiving hides it from lists and takes it out of job costs. The receipt image is kept.
      </p>
      {error ? <div className="mt-2"><Alert tone="bad">{error}</Alert></div> : null}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setConfirming(false)} disabled={pending}>
          Keep it
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="flex-1"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await archiveExpense({ expenseId });
              if (result.ok) {
                router.push("/expenses");
                router.refresh();
              } else {
                setError(result.message);
              }
            })
          }
        >
          {pending ? "Archiving…" : "Archive"}
        </Button>
      </div>
    </div>
  );
}
