"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl" aria-hidden="true">⚠️</p>
      <h1 className="mt-4 text-2xl font-black text-ink-900">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-ink-600">
        Nothing was saved. Try again — if it keeps happening, check your signal and reload.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex min-h-[var(--tap)] items-center rounded-lg bg-brand-600 px-5 font-semibold text-white"
      >
        Try again
      </button>
    </main>
  );
}
