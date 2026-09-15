"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveReceipt, discardReceipt, retryExtraction } from "./actions";
import {
  Button, Field, Input, MoneyInput, Select, Textarea, Alert, Card, CardHeader, Badge,
} from "@/components/ui";
import { formatMoney, centsToInput, parseMoneyToCents, exTaxFromInclusive, GST_BP } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { LOW_CONFIDENCE, type ExtractedReceipt } from "@/lib/receipts/types";
import type { SupplierOption, CategoryOption } from "@/modules/expenses/queries";

type JobOption = { id: string; jobNumber: string; title: string; clientName: string };

/**
 * Checking a receipt.
 *
 * The image and the fields sit side by side — on a laptop literally side by
 * side, on a phone the photo sits above with a tap-to-zoom. Anything the
 * model was unsure about is bordered amber with a plain-English note, so the
 * reviewer's eye goes straight there instead of re-reading all nine fields.
 *
 * Every edit is remembered as a corrected field, which is what the accuracy
 * figures in Settings are computed from.
 */
export function ReceiptReview({
  upload,
  extraction,
  imageUrl,
  suppliers,
  categories,
  jobs,
  next,
}: {
  upload: {
    id: string;
    status: string;
    filename: string;
    mimeType: string;
    overallConfidence: number | null;
    arithmeticOk: boolean | null;
    errorMessage: string | null;
    extractionProvider: string | null;
    extractionModel: string | null;
    suggestedSupplierId: string | null;
    suggestedCategoryId: string | null;
    suggestedJobId: string | null;
    suggestionReason: string | null;
    uploadedByName: string | null;
    ocrText: string | null;
  };
  extraction: ExtractedReceipt | null;
  imageUrl: string;
  suppliers: SupplierOption[];
  categories: CategoryOption[];
  jobs: JobOption[];
  next: { id: string; remaining: number } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [showOcr, setShowOcr] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const initial = useMemo(() => {
    const supplierGuess = extraction?.supplierName.value ?? "";
    const category = categories.find((c) => c.id === upload.suggestedCategoryId);
    const total = extraction?.totalCents.value ?? 0;
    const tax = extraction?.taxCents.value ?? null;
    return {
      supplierId: upload.suggestedSupplierId ?? "",
      supplierNameRaw: supplierGuess,
      categoryId: upload.suggestedCategoryId ?? "",
      jobId: upload.suggestedJobId ?? "",
      expenseDate: extraction?.date.value ?? new Date().toISOString().slice(0, 10),
      totalCents: total,
      taxCents: tax,
      hasGst: tax === null ? true : tax > 0,
      description:
        supplierGuess && extraction?.lineItems.length
          ? `${supplierGuess} — ${extraction.lineItems[0]!.description}`
          : supplierGuess || "",
      reference: extraction?.documentNumber.value ?? "",
      isBillable: category?.defaultBillable ?? true,
      notes: "",
      lineItems: extraction?.lineItems ?? [],
    };
  }, [extraction, upload, categories]);

  const [values, setValues] = useState(initial);
  const corrected = useRef(new Set<string>());

  function set<K extends keyof typeof initial>(key: K, value: (typeof initial)[K], field?: string) {
    setValues((v) => ({ ...v, [key]: value }));
    if (field) corrected.current.add(field);
  }

  const derivedTax = values.hasGst
    ? values.taxCents ?? values.totalCents - exTaxFromInclusive(values.totalCents, GST_BP)
    : 0;
  const subtotal = values.totalCents - derivedTax;

  const conf = (field: keyof ExtractedReceipt): number | null => {
    if (!extraction) return null;
    const value = extraction[field];
    return typeof value === "object" && value !== null && "confidence" in value
      ? (value as { confidence: number }).confidence
      : null;
  };

  function submit(andNext: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await approveReceipt({
        uploadId: upload.id,
        jobId: values.jobId,
        supplierId: values.supplierId,
        supplierNameRaw: values.supplierNameRaw,
        categoryId: values.categoryId,
        expenseDate: values.expenseDate,
        description: values.description,
        totalCents: String(values.totalCents / 100),
        taxCents: String(derivedTax / 100),
        hasGst: values.hasGst,
        isBillable: values.isBillable,
        reference: values.reference,
        notes: values.notes,
        correctedFields: [...corrected.current],
        lineItems: values.lineItems.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: String(l.unitPriceCents / 100),
          lineTotalCents: String(l.lineTotalCents / 100),
          confidence: l.confidence,
        })),
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (andNext && next) {
        router.push(`/receipts/${next.id}`);
      } else {
        router.push("/receipts");
      }
      router.refresh();
    });
  }

  const modelNotes = extraction?.notes;
  const failed = upload.status === "failed";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
      {/* ------------------------------- the photo ------------------------------ */}
      <Card className="lg:sticky lg:top-4">
        <CardHeader
          title="What you photographed"
          subtitle={upload.uploadedByName ? `Uploaded by ${upload.uploadedByName}` : undefined}
          action={
            <a
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-bold text-info-700 underline"
            >
              Full size
            </a>
          }
        />
        <div className="p-3">
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            className="block w-full cursor-zoom-in overflow-auto rounded-lg border border-ink-200 bg-ink-100"
            aria-label={zoomed ? "Zoom out" : "Zoom in on the receipt"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={`Receipt: ${upload.filename}`}
              className={zoomed ? "max-w-none" : "mx-auto max-h-[70vh] w-auto"}
              style={zoomed ? { width: "200%" } : undefined}
            />
          </button>
          <p className="mt-2 text-center text-sm text-ink-500">
            {zoomed ? "Tap the photo to zoom out" : "Tap the photo to zoom in"}
          </p>

          {upload.ocrText ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowOcr((s) => !s)}
                className="text-sm font-semibold text-ink-600 underline"
              >
                {showOcr ? "Hide" : "Show"} the raw text we read off it
              </button>
              {showOcr ? (
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-ink-900 p-3 text-xs text-ink-100">
                  {upload.ocrText}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      {/* ------------------------------- the fields ----------------------------- */}
      <div className="space-y-4">
        {failed ? (
          <Alert tone="bad" title="We couldn't read this one">
            {upload.errorMessage ?? "Something went wrong reading it."} Fill it in by hand below, or
            have another go at reading it.
            <div className="mt-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await retryExtraction({ uploadId: upload.id });
                    router.refresh();
                  })
                }
              >
                {pending ? "Reading…" : "Read it again"}
              </Button>
            </div>
          </Alert>
        ) : null}

        {upload.arithmeticOk === false ? (
          <Alert tone="warn" title="The numbers don't add up">
            Subtotal plus GST doesn&apos;t equal the total. Check each one against the photo — one of
            them has been misread.
          </Alert>
        ) : null}

        {modelNotes ? <Alert tone="info" title="Worth a look">{modelNotes}</Alert> : null}

        {upload.suggestionReason ? (
          <p className="rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-700">
            <span className="font-semibold">Why these suggestions: </span>
            {upload.suggestionReason}
          </p>
        ) : null}

        {error ? <Alert tone="bad">{error}</Alert> : null}

        <Card>
          <CardHeader
            title="Check these"
            subtitle="Anything amber, the reader wasn't sure about"
            action={
              upload.overallConfidence !== null ? (
                <Badge
                  tone={
                    upload.overallConfidence >= 90 ? "good" : upload.overallConfidence >= LOW_CONFIDENCE ? "warn" : "bad"
                  }
                >
                  {upload.overallConfidence}% sure
                </Badge>
              ) : undefined
            }
          />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <ConfidenceField
              label="Total on the receipt"
              htmlFor="rcTotal"
              confidence={conf("totalCents")}
              required
              hint={`Works out as ${formatMoney(subtotal)} + ${formatMoney(derivedTax)} GST`}
            >
              <MoneyInput
                id="rcTotal"
                defaultValue={centsToInput(values.totalCents)}
                onBlur={(e) => set("totalCents", parseMoneyToCents(e.target.value) ?? 0, "total")}
              />
            </ConfidenceField>

            <ConfidenceField label="Date" htmlFor="rcDate" confidence={conf("date")} required
                             hint={extraction?.date.raw ? `Printed as "${extraction.date.raw}"` : undefined}>
              <Input
                id="rcDate"
                type="date"
                value={values.expenseDate}
                onChange={(e) => set("expenseDate", e.target.value, "date")}
              />
            </ConfidenceField>

            <ConfidenceField
              label="Supplier"
              htmlFor="rcSupplier"
              confidence={conf("supplierName")}
              hint={
                values.supplierNameRaw
                  ? `The docket says "${values.supplierNameRaw}"`
                  : "Not found on the docket"
              }
              className="sm:col-span-2"
            >
              <Select
                id="rcSupplier"
                value={values.supplierId}
                onChange={(e) => {
                  const supplier = suppliers.find((s) => s.id === e.target.value);
                  set("supplierId", e.target.value, "supplier");
                  if (supplier?.defaultCategoryId && !values.categoryId) {
                    set("categoryId", supplier.defaultCategoryId);
                  }
                }}
              >
                <option value="">Not recorded — I&apos;ll leave it out</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </ConfidenceField>

            <div className="sm:col-span-2">
              <label className="flex min-h-[var(--tap)] items-center gap-2 text-sm font-semibold text-ink-700">
                <input
                  type="checkbox"
                  checked={values.hasGst}
                  onChange={(e) => set("hasGst", e.target.checked, "gst")}
                  className="h-5 w-5 rounded border-2 border-ink-400"
                />
                There&apos;s GST on this one
              </label>
              {values.hasGst ? (
                <div className="mt-2 max-w-48">
                  <MoneyInput
                    aria-label="GST amount"
                    defaultValue={centsToInput(derivedTax)}
                    onBlur={(e) => set("taxCents", parseMoneyToCents(e.target.value) ?? 0, "gst")}
                  />
                  <p className="field-hint">Blank or wrong? We work it out as an eleventh of the total.</p>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Where it goes" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="rcCategory" required
                   hint="Decides which budget bucket it hits.">
              <Select
                id="rcCategory"
                value={values.categoryId}
                onChange={(e) => {
                  const category = categories.find((c) => c.id === e.target.value);
                  set("categoryId", e.target.value, "category");
                  if (category) set("isBillable", category.defaultBillable);
                }}
                required
              >
                <option value="">Choose a category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>

            <Field label="Job" htmlFor="rcJob"
                   hint="Leave blank for an overhead like fuel or tools.">
              <Select id="rcJob" value={values.jobId} onChange={(e) => set("jobId", e.target.value, "job")}>
                <option value="">Overhead — not against a job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.jobNumber} — {j.title}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="What was it for?" htmlFor="rcDesc" required className="sm:col-span-2">
              <Input
                id="rcDesc"
                value={values.description}
                onChange={(e) => set("description", e.target.value, "description")}
                placeholder="Framing timber for the first floor"
                maxLength={500}
              />
            </Field>

            <Field label="Docket number" htmlFor="rcRef">
              <Input id="rcRef" value={values.reference} onChange={(e) => set("reference", e.target.value)} />
            </Field>

            <div className="flex items-end">
              <label
                className={`flex min-h-[var(--tap)] w-full cursor-pointer items-center gap-3 rounded-lg border-2 px-3 ${
                  values.isBillable ? "border-good-600 bg-good-50" : "border-ink-300 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={values.isBillable}
                  onChange={(e) => set("isBillable", e.target.checked, "billable")}
                  className="h-5 w-5 rounded border-2 border-ink-400"
                />
                <span className="font-semibold text-ink-900">Charge it on to the client</span>
              </label>
            </div>
          </div>
        </Card>

        {values.lineItems.length > 0 ? (
          <Card>
            <CardHeader
              title="What was on the docket"
              subtitle={`${values.lineItems.length} items read off it`}
              action={
                <Button size="sm" variant="ghost" onClick={() => set("lineItems", [], "lineItems")}>
                  Drop them
                </Button>
              }
            />
            <ul className="divide-y divide-ink-200">
              {values.lineItems.map((line, index) => (
                <li key={index} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {line.description}
                    {line.confidence < LOW_CONFIDENCE ? (
                      <span className="ml-2 text-xs font-bold text-warn-700">unsure</span>
                    ) : null}
                  </span>
                  <span className="tabular shrink-0 text-ink-600">{Number(line.quantity)} ×</span>
                  <span className="tabular shrink-0 font-semibold">{formatMoney(line.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Anything to add?" subtitle="Optional" />
          <div className="p-4">
            <Textarea
              value={values.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              aria-label="Notes"
              placeholder="Anything you want to remember about this one."
            />
          </div>
        </Card>

        {discarding ? (
          <Card className="border-2 border-bad-600">
            <div className="p-4">
              <p className="font-semibold text-ink-900">Bin this one?</p>
              <p className="mt-1 text-sm text-ink-600">
                Use this if it isn&apos;t a receipt, or you&apos;ve already entered it another way. The
                photo is kept either way.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setDiscarding(false)} disabled={pending}>
                  Keep it
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await discardReceipt({ uploadId: upload.id });
                      if (result.ok) {
                        router.push(next ? `/receipts/${next.id}` : "/receipts");
                        router.refresh();
                      } else {
                        setError(result.message);
                        setDiscarding(false);
                      }
                    })
                  }
                >
                  Bin it
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <div className="sticky bottom-20 z-20 space-y-2 rounded-xl border-2 border-ink-300 bg-white p-3 shadow-lg lg:bottom-4">
          <div className="flex items-baseline justify-between px-1">
            <span className="font-semibold text-ink-700">Saving as</span>
            <span className="tabular text-xl font-black text-ink-900">{formatMoney(values.totalCents)}</span>
          </div>
          <div className="flex gap-2">
            {!discarding ? (
              <Button variant="ghost" onClick={() => setDiscarding(true)} disabled={pending}>
                Bin it
              </Button>
            ) : null}
            {next ? (
              <Button
                variant="secondary"
                className="flex-1"
                disabled={pending || !values.categoryId || values.totalCents <= 0}
                onClick={() => submit(true)}
              >
                {pending ? "Saving…" : `Save & next (${next.remaining} left)`}
              </Button>
            ) : null}
            <Button
              size="lg"
              className="flex-1"
              disabled={pending || !values.categoryId || values.totalCents <= 0}
              onClick={() => submit(false)}
            >
              {pending ? "Saving…" : "Save it"}
            </Button>
          </div>
          {!values.categoryId ? (
            <p className="px-1 text-sm text-bad-700">Pick a category before you save.</p>
          ) : null}
        </div>

        <p className="text-center text-xs text-ink-500">
          Read by {upload.extractionProvider ?? "—"}
          {upload.extractionModel ? ` (${upload.extractionModel})` : ""} ·{" "}
          {extraction?.date.value ? formatDate(extraction.date.value) : "no date read"}
        </p>
      </div>
    </div>
  );
}

/** A field the model gave a confidence for. Amber border = look at this one. */
function ConfidenceField({
  label, htmlFor, confidence, hint, required, className, children,
}: {
  label: string;
  htmlFor: string;
  confidence: number | null;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const unsure = confidence !== null && confidence < LOW_CONFIDENCE;
  return (
    <div className={`${className ?? ""} ${unsure ? "-m-2 rounded-lg border-2 border-warn-500 bg-warn-50 p-2" : ""}`}>
      <label htmlFor={htmlFor} className="field-label flex items-center justify-between gap-2">
        <span>
          {label}
          {required ? <span className="ml-0.5 text-bad-600" aria-hidden="true">*</span> : null}
        </span>
        {confidence !== null ? (
          <span
            className={`text-xs font-bold ${unsure ? "text-warn-700" : "text-ink-400"}`}
            title={`The reader was ${confidence}% sure of this`}
          >
            {unsure ? `⚠ ${confidence}% sure — check it` : `${confidence}%`}
          </span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}
