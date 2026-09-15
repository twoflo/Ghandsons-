import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listPhotos, getPhotoCounts, PHOTO_CATEGORIES } from "@/modules/documents/queries";
import { formatDate, timeAgo } from "@/lib/dates";
import { Card, EmptyState, Badge } from "@/components/ui";
import { Uploader } from "@/modules/documents/uploader";
import { RemovePhotoButton } from "@/modules/documents/remove-buttons";

export const dynamic = "force-dynamic";

export default async function JobPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await requireUser();
  const [{ id }, { category }] = await Promise.all([params, searchParams]);

  const [photos, counts] = await Promise.all([listPhotos(id, category), getPhotoCounts(id)]);
  const total = Object.values(counts).reduce((a, n) => a + n, 0);

  return (
    <div className="space-y-5">
      {can(user.role, "documents.manage") ? (
        <Uploader
          target={`photo:${id}`}
          mode="photo"
          categories={PHOTO_CATEGORIES}
          label="📷 Add photos"
        />
      ) : null}

      {total > 0 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Filter photos">
          <Link
            href={`/jobs/${id}/photos`}
            className={`inline-flex min-h-9 items-center rounded-full border-2 px-3 text-sm font-bold ${
              !category ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white text-ink-700"
            }`}
          >
            All {total}
          </Link>
          {PHOTO_CATEGORIES.filter((c) => counts[c.value]).map((c) => (
            <Link
              key={c.value}
              href={`/jobs/${id}/photos?category=${c.value}`}
              className={`inline-flex min-h-9 items-center rounded-full border-2 px-3 text-sm font-bold ${
                category === c.value
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-ink-300 bg-white text-ink-700"
              }`}
            >
              {c.label} {counts[c.value]}
            </Link>
          ))}
        </nav>
      ) : null}

      {photos.length === 0 ? (
        <Card>
          <EmptyState
            icon="📷"
            title={category ? "None in that category" : "No photos yet"}
            body="Photograph the job as you go. Before, during, and anything that looks like it might be argued about later."
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.id} className="card overflow-hidden">
              <a href={`/api/files/${photo.fileId}`} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/${photo.fileId}`}
                  alt={photo.caption ?? "Site photo"}
                  className="aspect-[4/3] w-full bg-ink-100 object-cover"
                  loading="lazy"
                />
              </a>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 font-medium text-ink-900">
                    {photo.caption ?? <span className="italic text-ink-500">No caption</span>}
                  </p>
                  <Badge
                    tone={
                      photo.category === "defect" ? "bad" : photo.category === "compliance" ? "info" : "neutral"
                    }
                  >
                    {PHOTO_CATEGORIES.find((c) => c.value === photo.category)?.label ?? photo.category}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  {formatDate(photo.takenAt)} · {timeAgo(photo.takenAt)}
                  {photo.uploadedByName ? ` · ${photo.uploadedByName}` : ""}
                </p>
                {can(user.role, "documents.delete") ? (
                  <div className="mt-1 flex justify-end">
                    <RemovePhotoButton photoId={photo.id} />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
