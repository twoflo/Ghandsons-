"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logInteraction } from "./actions";
import { Button, Select, Input, Textarea, Alert } from "@/components/ui";

const KINDS = [
  { value: "call", label: "📞 Call" },
  { value: "email", label: "✉️ Email" },
  { value: "sms", label: "💬 Text" },
  { value: "meeting", label: "🤝 Meeting" },
  { value: "site_visit", label: "🚗 Site visit" },
  { value: "note", label: "📝 Note" },
];

export function InteractionForm({ clientId, jobId }: { clientId: string; jobId?: string }) {
  const router = useRouter();
  const [kind, setKind] = useState("call");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await logInteraction({ clientId, jobId, kind, summary, detail });
      if (result.ok) {
        setSummary("");
        setDetail("");
        setExpanded(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type of contact" className="max-w-40">
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </Select>
        <Input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder="What happened?"
          aria-label="What happened"
          maxLength={300}
        />
      </div>
      {expanded ? (
        <Textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Any detail worth remembering (optional)"
          aria-label="Detail"
          rows={2}
        />
      ) : null}
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {expanded || summary ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => { setExpanded(false); setSummary(""); setDetail(""); }} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !summary.trim()}>
            {pending ? "Saving…" : "Log it"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
