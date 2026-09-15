import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl" aria-hidden="true">🧭</p>
      <h1 className="mt-4 text-2xl font-black text-ink-900">That page isn&apos;t here</h1>
      <p className="mt-2 max-w-sm text-ink-600">
        The link might be old, or the job might have been deleted. Nothing has been lost.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex min-h-[var(--tap)] items-center rounded-lg bg-brand-600 px-5 font-semibold text-white"
      >
        Back to Today
      </Link>
    </main>
  );
}
