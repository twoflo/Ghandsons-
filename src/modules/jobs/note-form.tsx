"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addJobNote } from "./actions";
import { Button, Textarea, Alert } from "@/components/ui";

export function JobNoteForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addJobNote({ jobId, body, pinned });
      if (result.ok) {
        setBody("");
        setPinned(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="jobNote" className="field-label">Add a note</label>
      <Textarea
        id="jobNote"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What happened on site today?"
        disabled={pending}
      />
      {error ? <div className="mt-2"><Alert tone="bad">{error}</Alert></div> : null}
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex min-h-[var(--tap)] items-center gap-2 text-sm font-semibold text-ink-700">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="h-5 w-5 rounded border-2 border-ink-400"
          />
          Pin it to the top
        </label>
        <Button type="submit" disabled={pending || !body.trim()}>
          {pending ? "Saving…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
