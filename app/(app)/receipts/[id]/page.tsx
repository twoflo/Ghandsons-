import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getReceipt, getNextInQueue } from "@/modules/receipts/queries";
import { getExpenseFormOptions } from "@/modules/expenses/queries";
import { ReceiptReview } from "@/modules/receipts/review";
import { PageHeader, Card, Alert } from "@/components/ui";
import { QueueRefresher } from "@/modules/receipts/queue-refresher";
import type { ExtractedReceipt } from "@/lib/receipts/types";

export const metadata = { title: "Check a receipt" };
export const dynamic = "force-dynamic";

export default async function ReceiptReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const receipt = await getReceipt(id);
  if (!receipt) notFound();

  if (receipt.expenseId) redirect(`/expenses/${receipt.expenseId}`);

  if (!can(user.role, "receipts.review")) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Receipt" back={{ href: "/receipts", label: "Receipts" }} />
        <Card className="p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${receipt.fileId}`}
            alt="The receipt you uploaded"
            className="mx-auto max-h-[70vh] rounded-lg border border-ink-200"
          />
          <p className="mt-4 text-center text-ink-700">
            This is in the queue. The office will check it and save it as an expense.
          </p>
        </Card>
      </div>
    );
  }

  if (receipt.status === "uploaded" || receipt.status === "processing") {
    return (
      <div className="mx-auto max-w-2xl">
        <QueueRefresher intervalMs={2500} />
        <PageHeader title="Reading it now" back={{ href: "/receipts", label: "Receipt queue" }} />
        <Card className="p-6 text-center">
          <p className="text-4xl" aria-hidden="true">🔎</p>
          <p className="mt-3 font-bold text-ink-900">Hang on a moment</p>
          <p className="mt-1 text-ink-600">
            We&apos;re reading this one. It usually takes a few seconds — this page will update itself.
          </p>
        </Card>
      </div>
    );
  }

  const [options, next] = await Promise.all([
    getExpenseFormOptions(),
    getNextInQueue(receipt.id, receipt.batchId),
  ]);

  const extraction = (receipt.extraction as ExtractedReceipt | null) ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Check this receipt"
        subtitle={
          next ? (
            <span>
              {next.remaining} more after this one.{" "}
              <Link href="/receipts" className="underline">Back to the queue</Link>
            </span>
          ) : (
            "Last one in the queue."
          )
        }
        back={{ href: "/receipts", label: "Receipt queue" }}
      />

      {receipt.status === "discarded" ? (
        <div className="mb-4">
          <Alert tone="warn" title="This one was binned">
            It&apos;s still here if you want to save it after all.
          </Alert>
        </div>
      ) : null}

      <ReceiptReview
        upload={{
          id: receipt.id,
          status: receipt.status,
          filename: receipt.filename,
          mimeType: receipt.mimeType,
          overallConfidence: receipt.overallConfidence,
          arithmeticOk: receipt.arithmeticOk,
          errorMessage: receipt.errorMessage,
          extractionProvider: receipt.extractionProvider,
          extractionModel: receipt.extractionModel,
          suggestedSupplierId: receipt.suggestedSupplierId,
          suggestedCategoryId: receipt.suggestedCategoryId,
          suggestedJobId: receipt.suggestedJobId,
          suggestionReason: receipt.suggestionReason,
          uploadedByName: receipt.uploadedByName,
          ocrText: receipt.ocrText,
        }}
        extraction={extraction}
        imageUrl={`/api/files/${receipt.fileId}`}
        suppliers={options.suppliers}
        categories={options.categories}
        jobs={options.jobs}
        next={next}
      />
    </div>
  );
}
