"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { compressImage, formatBytes } from "@/modules/receipts/compress";
import { Button, Field, Input, Select, Textarea, Alert } from "@/components/ui";

/**
 * Attaching files to a job, a client or a compliance record.
 *
 * Photos are compressed in the browser like receipts are; a PDF plan set
 * goes up as-is. One form, two modes, because "add a photo" and "add the
 * approved drawings" are the same gesture as far as the owner is concerned.
 */
export function Uploader({
  target,
  mode,
  kinds,
  categories,
  label,
}: {
  /** "job:<id>" | "photo:<jobId>" | "client:<id>" | "compliance:<id>" */
  target: string;
  mode: "document" | "photo";
  kinds?: ReadonlyArray<{ value: string; label: string }>;
  categories?: ReadonlyArray<{ value: string; label: string }>;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function pick(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const prepared = await Promise.all(
      Array.from(list).map((file) => (mode === "photo" ? compressImage(file) : Promise.resolve(file))),
    );
    setFiles((current) => [...current, ...prepared]);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) {
      setError("Choose a file first.");
      return;
    }
    const data = new FormData(event.currentTarget);
    data.delete("picker");
    data.append("target", target);
    for (const file of files) data.append("files", file);

    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/uploads", { method: "POST", body: data });
        const payload = (await response.json().catch(() => null)) as
          | { message?: string; error?: string; rejected?: Array<{ reason: string }> }
          | null;

        if (!response.ok) throw new Error(payload?.error ?? "The upload didn't go through.");
        if (payload?.rejected?.length) throw new Error(payload.rejected[0]!.reason);

        setNotice(payload?.message ?? "Saved.");
        setFiles([]);
        setOpen(false);
        formRef.current?.reset();
        router.refresh();
      } catch (e) {
        setError(
          e instanceof TypeError
            ? "Couldn't reach the server. Check your signal and try again."
            : e instanceof Error
              ? e.message
              : "Something went wrong.",
        );
      }
    });
  }

  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)}>{label}</Button>
        {notice ? <div className="mt-2"><Alert tone="good">{notice}</Alert></div> : null}
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="rounded-lg border-2 border-brand-500 bg-brand-50 p-4">
      {error ? <div className="mb-3"><Alert tone="bad">{error}</Alert></div> : null}

      <div className="space-y-3">
        <Field label={mode === "photo" ? "Photos" : "Files"} htmlFor={`picker-${target}`} required>
          <Input
            id={`picker-${target}`}
            name="picker"
            type="file"
            multiple
            accept={mode === "photo" ? "image/*" : "image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"}
            capture={mode === "photo" ? "environment" : undefined}
            onChange={(e) => void pick(e.target.files)}
            className="!py-2"
          />
        </Field>

        {files.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{file.name}</span>
                <span className="shrink-0 text-ink-500">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((c) => c.filter((_, index) => index !== i))}
                  className="shrink-0 rounded px-2 font-bold text-bad-700"
                  aria-label={`Remove ${file.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {mode === "photo" ? (
          <>
            <Field label="What's in the photo?" htmlFor={`caption-${target}`}
                   hint="A line you'd understand in two years' time.">
              <Input id={`caption-${target}`} name="caption" placeholder="First floor frame up, portal propped" />
            </Field>
            <Field label="What sort of photo?" htmlFor={`category-${target}`}>
              <Select id={`category-${target}`} name="category" defaultValue="progress">
                {(categories ?? []).map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="What is it?" htmlFor={`title-${target}`}>
              <Input id={`title-${target}`} name="title" placeholder="Architectural drawings — Rev C" />
            </Field>
            <Field label="Sort of document" htmlFor={`kind-${target}`}>
              <Select id={`kind-${target}`} name="kind" defaultValue="document">
                {(kinds ?? []).map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" htmlFor={`notes-${target}`}>
              <Textarea id={`notes-${target}`} name="notes" rows={2} />
            </Field>
          </>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1"
                  onClick={() => { setOpen(false); setFiles([]); }} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={pending || files.length === 0}>
            {pending ? "Saving…" : `Save ${files.length || ""}`}
          </Button>
        </div>
      </div>
    </form>
  );
}
