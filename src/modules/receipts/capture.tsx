"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage, formatBytes } from "./compress";
import { Button, Select, Alert, Card, CardHeader, Field } from "@/components/ui";

type QueueItem = {
  key: string;
  file: File;
  previewUrl: string;
  originalBytes: number;
  compressedBytes: number | null;
  status: "preparing" | "ready" | "uploading" | "done" | "failed";
  error: string | null;
  attempts: number;
};

/**
 * Snapping dockets.
 *
 * Built for the actual moment this happens: standing at the ute with one
 * hand, glare on the screen, maybe a bar of signal. So:
 *   - one enormous button that opens the camera straight away
 *   - photos shrink on the phone before they're sent
 *   - each upload is its own request, so one failure doesn't lose the rest
 *   - failures stay on screen with a Try again, never silently vanish
 *   - the page warns before you leave with uploads still going
 */
export function ReceiptCapture({
  jobs,
  defaultJobId,
}: {
  jobs: Array<{ id: string; jobNumber: string; title: string }>;
  defaultJobId?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const uploading = items.some((i) => i.status === "uploading" || i.status === "preparing");
  const pending = items.filter((i) => i.status === "ready" || i.status === "failed");
  const done = items.filter((i) => i.status === "done");

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Don't let someone close the tab mid-upload and lose a docket.
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  useEffect(() => {
    return () => {
      for (const item of items) URL.revokeObjectURL(item.previewUrl);
    };
    // Only on unmount — revoking on every change would blank the thumbnails.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setNotice(null);

    const incoming: QueueItem[] = Array.from(fileList).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      originalBytes: file.size,
      compressedBytes: null,
      status: "preparing",
      error: null,
      attempts: 0,
    }));

    setItems((current) => [...current, ...incoming]);

    for (const item of incoming) {
      const compressed = await compressImage(item.file);
      setItems((current) =>
        current.map((i) =>
          i.key === item.key
            ? { ...i, file: compressed, compressedBytes: compressed.size, status: "ready" }
            : i,
        ),
      );
    }
  }, []);

  async function uploadOne(item: QueueItem): Promise<boolean> {
    setItems((c) => c.map((i) => (i.key === item.key ? { ...i, status: "uploading", error: null } : i)));

    const body = new FormData();
    body.append("files", item.file);
    if (jobId) body.append("jobId", jobId);

    try {
      const response = await fetch("/api/receipts/upload", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as
        | { uploaded?: unknown[]; rejected?: Array<{ reason: string }>; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "The upload didn't go through.");
      }
      if (payload?.rejected?.length) {
        throw new Error(payload.rejected[0]!.reason);
      }

      setItems((c) => c.map((i) => (i.key === item.key ? { ...i, status: "done" } : i)));
      return true;
    } catch (error) {
      const message =
        error instanceof TypeError
          ? "Couldn't reach the server. Check your signal and press Try again."
          : error instanceof Error
            ? error.message
            : "Something went wrong.";
      setItems((c) =>
        c.map((i) =>
          i.key === item.key
            ? { ...i, status: "failed", error: message, attempts: i.attempts + 1 }
            : i,
        ),
      );
      return false;
    }
  }

  async function uploadAll() {
    setNotice(null);
    const queue = items.filter((i) => i.status === "ready" || i.status === "failed");
    let ok = 0;
    // One at a time: a phone on poor 4G does worse with parallel uploads.
    for (const item of queue) {
      const success = await uploadOne(item);
      if (success) ok += 1;
    }
    if (ok > 0) {
      setNotice(
        `${ok} receipt${ok === 1 ? "" : "s"} sent. ${ok === 1 ? "It's" : "They're"} being read now — check the queue in a moment.`,
      );
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      {!online ? (
        <Alert tone="warn" title="You're offline">
          Take the photos anyway — they'll stay on this screen. Press Send when you&apos;ve got signal
          back. Don&apos;t close the page.
        </Alert>
      ) : null}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-4 border-dashed border-brand-400 bg-brand-50 text-brand-800 transition-colors hover:bg-brand-100 active:bg-brand-200"
      >
        <span className="text-5xl" aria-hidden="true">📷</span>
        <span className="text-xl font-black">Take a photo</span>
        <span className="text-sm font-medium text-brand-700">
          Flat on the tailgate, good light, whole docket in frame
        </span>
      </button>

      <div className="flex gap-2">
        <Button variant="secondary" size="lg" className="flex-1" onClick={() => libraryRef.current?.click()}>
          🖼️ Choose from photos
        </Button>
      </div>

      {jobs.length > 0 ? (
        <Card>
          <div className="p-4">
            <Field
              label="Which job are these for?"
              htmlFor="captureJob"
              hint="Optional. It's a strong hint for the job suggestion, and you can change it when you check each one."
            >
              <Select id="captureJob" value={jobId} onChange={(e) => setJobId(e.target.value)}>
                <option value="">Work it out for me</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobNumber} — {job.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      ) : null}

      {notice ? <Alert tone="good">{notice}</Alert> : null}

      {items.length > 0 ? (
        <Card>
          <CardHeader
            title={`${items.length} photo${items.length === 1 ? "" : "s"}`}
            subtitle={done.length > 0 ? `${done.length} sent` : undefined}
            action={
              done.length > 0 && pending.length === 0 ? (
                <Button size="sm" variant="secondary" onClick={() => setItems([])}>
                  Clear
                </Button>
              ) : undefined
            }
          />
          <ul className="divide-y divide-ink-200">
            {items.map((item) => (
              <li key={item.key} className="flex items-center gap-3 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg border border-ink-200 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{item.file.name}</p>
                  <p className="text-sm text-ink-600">
                    {item.compressedBytes !== null && item.compressedBytes < item.originalBytes ? (
                      <>
                        {formatBytes(item.originalBytes)} → {formatBytes(item.compressedBytes)}{" "}
                        <span className="text-good-700">shrunk for a slow connection</span>
                      </>
                    ) : (
                      formatBytes(item.originalBytes)
                    )}
                  </p>
                  {item.error ? <p className="mt-0.5 text-sm font-medium text-bad-700">{item.error}</p> : null}
                </div>
                <div className="shrink-0">
                  {item.status === "preparing" ? (
                    <span className="text-sm text-ink-500">Preparing…</span>
                  ) : item.status === "uploading" ? (
                    <span className="text-sm font-semibold text-info-700">Sending…</span>
                  ) : item.status === "done" ? (
                    <span className="text-sm font-bold text-good-700">✓ Sent</span>
                  ) : item.status === "failed" ? (
                    <Button size="sm" variant="secondary" onClick={() => void uploadOne(item)}>
                      Try again
                    </Button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setItems((c) => c.filter((i) => i.key !== item.key))}
                      className="h-9 w-9 rounded border border-ink-300 text-ink-600"
                      aria-label={`Remove ${item.file.name}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <div className="sticky bottom-20 z-20 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
          <Button size="lg" className="w-full" onClick={() => void uploadAll()} disabled={uploading}>
            {uploading
              ? "Sending…"
              : `Send ${pending.length} receipt${pending.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      ) : null}

      {done.length > 0 && pending.length === 0 ? (
        <div className="sticky bottom-20 z-20 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
          <Button size="lg" className="w-full" onClick={() => router.push("/receipts")}>
            Go to the review queue
          </Button>
        </div>
      ) : null}
    </div>
  );
}
