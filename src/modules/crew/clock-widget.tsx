"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clockOn, clockOff } from "./actions";
import type { OpenEntry, ClockJobOption } from "./queries";
import { Button, Select, Alert, Field, Input } from "@/components/ui";
import { formatHours } from "@/lib/money";

/**
 * The one control that has to work with a gloved thumb, one-handed, in the
 * sun, on one bar of reception. Big buttons, optimistic state, and a clear
 * message when the network drops — the shift is never silently lost.
 */
export function ClockWidget({ openEntry, jobs }: { openEntry: OpenEntry; jobs: ClockJobOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jobId, setJobId] = useState(jobs.find((j) => j.assigned)?.id ?? jobs[0]?.id ?? "");
  const [showOff, setShowOff] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState("30");
  const [elapsed, setElapsed] = useState(openEntry?.minutesSoFar ?? 0);
  const startedAt = useRef(openEntry?.startedAt ?? null);

  // Tick the elapsed timer locally so it stays live without polling the server.
  useEffect(() => {
    if (!openEntry) return;
    startedAt.current = openEntry.startedAt;
    setElapsed(openEntry.minutesSoFar);
    const id = setInterval(() => {
      if (!startedAt.current) return;
      setElapsed(Math.floor((Date.now() - new Date(startedAt.current).getTime()) / 60_000));
    }, 30_000);
    return () => clearInterval(id);
  }, [openEntry]);

  function position(): Promise<{ latitude?: string; longitude?: string }> {
    // Best effort only — a refused or slow fix must never block clocking on.
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve({});
      const timer = setTimeout(() => resolve({}), 3000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve({
            latitude: pos.coords.latitude.toFixed(6),
            longitude: pos.coords.longitude.toFixed(6),
          });
        },
        () => {
          clearTimeout(timer);
          resolve({});
        },
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 120_000 },
      );
    });
  }

  function handleOn() {
    setError(null);
    setNotice(null);
    if (!jobId) {
      setError("Pick a job first.");
      return;
    }
    startTransition(async () => {
      const where = await position();
      const result = await clockOn({ jobId, ...where });
      if (result.ok) {
        setNotice(result.message ?? "Clocked on.");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function handleOff() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const where = await position();
      const result = await clockOff({ breakMinutes, ...where });
      if (result.ok) {
        setNotice(result.message ?? "Clocked off.");
        setShowOff(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  if (openEntry) {
    return (
      <section className="rounded-[var(--radius-card)] border-2 border-good-600 bg-good-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-good-700">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-good-600" aria-hidden="true" />
              Clocked on
            </p>
            <p className="mt-0.5 truncate text-lg font-bold text-ink-900">
              {openEntry.jobNumber ? `${openEntry.jobNumber} — ${openEntry.jobTitle}` : "No job selected"}
            </p>
            <p className="tabular text-ink-700">{formatHours(elapsed)} so far</p>
          </div>
          {!showOff ? (
            <Button variant="danger" size="lg" onClick={() => setShowOff(true)} disabled={pending}>
              Clock off
            </Button>
          ) : null}
        </div>

        {showOff ? (
          <div className="mt-4 space-y-3 rounded-lg bg-white p-3">
            <Field label="Unpaid break" htmlFor="breakMinutes" hint="Smoko and lunch. Leave 0 if you worked through.">
              <div className="flex gap-2">
                {["0", "30", "45", "60"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBreakMinutes(value)}
                    className={`min-h-[var(--tap)] flex-1 rounded-lg border-2 font-bold ${
                      breakMinutes === value
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-ink-300 bg-white text-ink-700"
                    }`}
                  >
                    {value === "0" ? "None" : `${value}m`}
                  </button>
                ))}
              </div>
              <Input
                id="breakMinutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={480}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
                className="mt-2"
                aria-label="Break in minutes"
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" className="flex-1" onClick={() => setShowOff(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="danger" size="lg" className="flex-1" onClick={handleOff} disabled={pending}>
                {pending ? "Saving…" : "Confirm clock off"}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <div className="mt-3"><Alert tone="bad">{error}</Alert></div> : null}
        {notice ? <div className="mt-3"><Alert tone="good">{notice}</Alert></div> : null}
      </section>
    );
  }

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="clockJob" className="field-label">
            Clock on to
          </label>
          <Select id="clockJob" value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={pending}>
            {jobs.length === 0 ? <option value="">No live jobs</option> : null}
            {jobs.some((j) => j.assigned) ? (
              <optgroup label="Your jobs">
                {jobs.filter((j) => j.assigned).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.jobNumber} — {j.title}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="All live jobs">
              {jobs.filter((j) => !j.assigned).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.jobNumber} — {j.title}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
        <Button size="lg" onClick={handleOn} disabled={pending || jobs.length === 0} className="min-w-36">
          {pending ? "Starting…" : "Clock on"}
        </Button>
      </div>
      {error ? <div className="mt-3"><Alert tone="bad">{error}</Alert></div> : null}
      {notice ? <div className="mt-3"><Alert tone="good">{notice}</Alert></div> : null}
    </section>
  );
}
