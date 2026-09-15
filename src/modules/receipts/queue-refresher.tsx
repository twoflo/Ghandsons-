"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Receipts are read after the upload response goes back, so the queue needs
 * to find out when one finishes. A refresh every four seconds while anything
 * is still in flight is cheaper and far simpler than a socket, and it stops
 * the moment the queue is quiet.
 */
export function QueueRefresher({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return (
    <p className="mb-3 flex items-center gap-2 rounded-lg bg-info-50 px-3 py-2 text-sm font-semibold text-info-700">
      <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-info-600" aria-hidden="true" />
      Reading your receipts — this page updates itself.
    </p>
  );
}
