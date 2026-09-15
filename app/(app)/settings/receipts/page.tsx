import { requireUser } from "@/lib/auth";
import { getExtractionAccuracy, getQueueCounts } from "@/modules/receipts/queries";
import { Card, CardHeader, StatTile, Alert, Progress } from "@/components/ui";
import { formatBp } from "@/lib/money";

export const metadata = { title: "Receipt reading" };
export const dynamic = "force-dynamic";

export default async function ReceiptSettingsPage() {
  await requireUser();
  const [accuracy, counts] = await Promise.all([getExtractionAccuracy(), getQueueCounts()]);

  const cleanBp =
    accuracy.reviewed > 0 ? Math.round((accuracy.untouched / accuracy.reviewed) * 10_000) : 0;

  const fields = [
    { label: "Supplier", wrong: accuracy.correctedSupplier },
    { label: "Date", wrong: accuracy.correctedDate },
    { label: "Total", wrong: accuracy.correctedTotal },
    { label: "Job", wrong: accuracy.correctedJob },
    { label: "Category", wrong: accuracy.correctedCategory },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="How well it's reading your receipts"
          subtitle="Measured against what you actually changed on review, not a guess"
        />
        <div className="p-4">
          {accuracy.reviewed === 0 ? (
            <Alert tone="info">
              Nothing checked yet. Once you&apos;ve saved a few receipts this will show how often it
              got them right first time, and which field it struggles with.
            </Alert>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
                <StatTile label="Receipts checked" value={accuracy.reviewed} />
                <StatTile
                  label="Right first time"
                  value={formatBp(cleanBp)}
                  sub={`${accuracy.untouched} needed no correcting`}
                  tone={cleanBp > 7000 ? "good" : cleanBp > 4000 ? "warn" : "bad"}
                />
                <StatTile label="Average confidence" value={`${accuracy.avgConfidence}%`} />
              </div>

              <p className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">
                What it gets wrong most
              </p>
              <ul className="space-y-3">
                {fields
                  .sort((a, b) => b.wrong - a.wrong)
                  .map((field) => (
                    <li key={field.label}>
                      <div className="mb-1 flex items-baseline justify-between text-sm">
                        <span className="font-semibold text-ink-700">{field.label}</span>
                        <span className="tabular text-ink-600">
                          corrected on {field.wrong} of {accuracy.reviewed}
                        </span>
                      </div>
                      <Progress
                        value={field.wrong}
                        max={accuracy.reviewed}
                        tone={field.wrong / accuracy.reviewed > 0.3 ? "bad" : "warn"}
                        label={`${field.label} corrections`}
                      />
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="The queue right now" />
        <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
          <StatTile label="To check" value={counts.needsReview} tone={counts.needsReview > 0 ? "warn" : "good"} />
          <StatTile label="Being read" value={counts.processing} />
          <StatTile label="Couldn't read" value={counts.failed} tone={counts.failed > 0 ? "bad" : "good"} />
          <StatTile label="Saved today" value={counts.approvedToday} tone="good" />
        </div>
      </Card>

      <Card>
        <CardHeader title="How it's set up" />
        <div className="space-y-3 p-4 text-sm text-ink-700">
          <p>
            <strong className="text-ink-900">Reading:</strong>{" "}
            {process.env.EXTRACTION_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY
              ? `Claude vision (${process.env.EXTRACTION_MODEL ?? "claude-opus-5"})`
              : "Stand-in mode — no API key is set, so the figures on new receipts are placeholders. Everything else works."}
          </p>
          <p>
            <strong className="text-ink-900">Text layer:</strong>{" "}
            {process.env.OCR_PROVIDER === "tesseract"
              ? "Tesseract runs first and its text is handed to the model as a hint."
              : "Off. The model reads the photo directly, which is usually better on thermal print."}
          </p>
          <p>
            <strong className="text-ink-900">Photos:</strong> shrunk to 1600px in the browser before
            upload, and the original is kept against the expense forever.
          </p>
          <p className="rounded-lg bg-ink-100 p-3">
            To switch the real reader on, set <code className="font-mono">EXTRACTION_PROVIDER=anthropic</code>{" "}
            and <code className="font-mono">ANTHROPIC_API_KEY</code> in the environment, then restart.
          </p>
        </div>
      </Card>
    </div>
  );
}
