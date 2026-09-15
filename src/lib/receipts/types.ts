/**
 * The structured result of reading a photographed receipt.
 *
 * Every field carries its own confidence (0-100) because that is what the
 * review screen is built around: the human only needs to look hard at the
 * fields the model was unsure about. A single document-level score would
 * make the reviewer re-check everything, which defeats the purpose.
 */

export type Confident<T> = {
  value: T;
  /** 0-100. Below LOW_CONFIDENCE the review screen highlights the field. */
  confidence: number;
  /** What the model actually saw on the page, if it differs from `value`. */
  raw?: string | null;
};

export type ExtractedLineItem = {
  description: string;
  quantity: string;
  unitPriceCents: number;
  lineTotalCents: number;
  confidence: number;
};

export type ExtractedReceipt = {
  supplierName: Confident<string | null>;
  abn: Confident<string | null>;
  /** ISO yyyy-mm-dd. */
  date: Confident<string | null>;
  documentNumber: Confident<string | null>;
  subtotalCents: Confident<number | null>;
  taxCents: Confident<number | null>;
  totalCents: Confident<number | null>;
  paymentMethod: Confident<string | null>;
  lineItems: ExtractedLineItem[];
  /** Anything the model wants the reviewer to know: creases, glare, cut-off. */
  notes: string | null;
  /** True when the document looks like a receipt at all. */
  isReceipt: boolean;
};

/** Fields below this are highlighted amber on the review screen. */
export const LOW_CONFIDENCE = 80;
/** Below this the field is treated as unusable and left blank for the human. */
export const UNUSABLE_CONFIDENCE = 40;

export type ExtractionOutcome = {
  extraction: ExtractedReceipt;
  overallConfidence: number;
  arithmeticOk: boolean;
  provider: string;
  model: string | null;
  elapsedMs: number;
  warnings: string[];
};

export function fieldsOf(extraction: ExtractedReceipt): Array<{ key: string; confidence: number }> {
  return [
    { key: "supplierName", confidence: extraction.supplierName.confidence },
    { key: "date", confidence: extraction.date.confidence },
    { key: "subtotalCents", confidence: extraction.subtotalCents.confidence },
    { key: "taxCents", confidence: extraction.taxCents.confidence },
    { key: "totalCents", confidence: extraction.totalCents.confidence },
  ];
}

/** The queue is sorted by this: the shakiest receipts get looked at first. */
export function scoreExtraction(extraction: ExtractedReceipt): number {
  const fields = fieldsOf(extraction);
  if (fields.length === 0) return 0;
  // The lowest field drags the score down — one bad total matters more than
  // four good ones.
  const lowest = Math.min(...fields.map((f) => f.confidence));
  const mean = fields.reduce((a, f) => a + f.confidence, 0) / fields.length;
  return Math.round(lowest * 0.6 + mean * 0.4);
}
