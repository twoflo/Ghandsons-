import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listDocuments, DOCUMENT_KINDS } from "@/modules/documents/queries";
import { formatBytes } from "@/modules/receipts/compress";
import { formatDate } from "@/lib/dates";
import { Card, CardHeader, EmptyState, Badge } from "@/components/ui";
import { Uploader } from "@/modules/documents/uploader";
import { RemoveDocumentButton } from "@/modules/documents/remove-buttons";

export const dynamic = "force-dynamic";

export default async function JobDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const documents = await listDocuments("job", id);

  const grouped = DOCUMENT_KINDS.map((kind) => ({
    ...kind,
    items: documents.filter((d) => d.kind === kind.value),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {can(user.role, "documents.manage") ? (
        <Uploader
          target={`job:${id}`}
          mode="document"
          kinds={DOCUMENT_KINDS}
          label="+ Add a document"
        />
      ) : null}

      {documents.length === 0 ? (
        <Card>
          <EmptyState
            icon="📁"
            title="Nothing filed against this job"
            body="Plans, the building approval, signed variations, certificates — put them here and they're with you on site."
          />
        </Card>
      ) : (
        grouped.map((group) => (
          <Card key={group.value}>
            <CardHeader
              title={`${group.icon} ${group.label}`}
              subtitle={`${group.items.length} file${group.items.length === 1 ? "" : "s"}`}
            />
            <ul className="divide-y divide-ink-200">
              {group.items.map((doc) => (
                <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                  <a
                    href={`/api/files/${doc.fileId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate font-semibold text-ink-900 underline">{doc.title ?? doc.filename}</p>
                    <p className="truncate text-sm text-ink-600">
                      {doc.notes ? `${doc.notes} · ` : ""}
                      {formatBytes(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                      {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
                    </p>
                  </a>
                  {doc.mimeType === "application/pdf" ? <Badge>PDF</Badge> : null}
                  {can(user.role, "documents.delete") ? (
                    <RemoveDocumentButton linkId={doc.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
