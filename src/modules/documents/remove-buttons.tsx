"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeDocument, removePhoto } from "./actions";

function ConfirmRemove({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-9 shrink-0 rounded px-2 text-sm font-bold text-ink-500 hover:bg-ink-200"
        aria-label={label}
      >
        Remove
      </button>
    );
  }

  return (
    <span className="flex shrink-0 gap-1">
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="min-h-9 rounded px-2 text-sm font-bold text-ink-600"
      >
        Keep
      </button>
      <button
        type="button"
        onClick={onConfirm}
        className="min-h-9 rounded bg-bad-600 px-2 text-sm font-bold text-white"
      >
        Remove
      </button>
    </span>
  );
}

export function RemoveDocumentButton({ linkId }: { linkId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <ConfirmRemove
      label="Remove this document"
      onConfirm={() =>
        startTransition(async () => {
          await removeDocument({ linkId });
          router.refresh();
        })
      }
    />
  );
}

export function RemovePhotoButton({ photoId }: { photoId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <ConfirmRemove
      label="Remove this photo"
      onConfirm={() =>
        startTransition(async () => {
          await removePhoto({ photoId });
          router.refresh();
        })
      }
    />
  );
}
