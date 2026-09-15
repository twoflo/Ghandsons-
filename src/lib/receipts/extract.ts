import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ReceiptExtractionSchema, type ReceiptExtractionRaw } from "./schema";
import {
  scoreExtraction, type ExtractedReceipt, type ExtractionOutcome, type ExtractedLineItem,
} from "./types";
import { parseMoneyToCents, exTaxFromInclusive, GST_BP } from "../money";

/* ------------------------------ the prompt ------------------------------- */

const SYSTEM_PROMPT = `You read photographs of receipts and dockets for an Australian building company and turn them into structured data.

What you are looking at is usually a thermal-printer docket photographed on a ute tailgate: creased, curled, sometimes half in shadow. Read what is actually printed. Do not infer, tidy up, or fill gaps with what a receipt "usually" says.

Rules that matter:

1. TRANSCRIBE, DON'T CALCULATE. Copy each amount exactly as printed. If the subtotal is not printed, return null for it — do not work it out from the total. Someone downstream checks the arithmetic; your job is to read.

2. AUSTRALIAN DATES. 03/09/2026 is 3 September 2026, not 9 March. Convert to yyyy-mm-dd and also return the raw string you read.

3. GST. Australian tax invoices show GST as a separate line, normally one eleventh of the total. If GST is printed, transcribe it. If the docket says "GST FREE", "NO GST" or shows no GST line, return null — do not assume 10%.

4. BE HONEST ABOUT CONFIDENCE. A crisp, well-lit number is 95+. A digit you had to guess between two readings is below 50. A field that isn't visible at all is null with confidence 0. Overstating confidence is worse than understating it, because it means nobody checks the number.

5. FLAG WHAT'S WRONG WITH THE IMAGE. If a crease runs through the total, if there's glare on the date, if the bottom is cut off — say so in notes, in plain words a builder would use. That note goes straight to the person reviewing it.

6. NOT A RECEIPT. If the photo is of something else — a plan, a wall, a blurry nothing — set isReceipt to false and leave the fields null.`;

function userPrompt(ocrText: string | null): string {
  const base = `Read this receipt and return the structured data.`;
  if (!ocrText?.trim()) return base;
  return `${base}

An OCR pass produced the text below. Treat it as a hint only — it garbles thermal print and often merges columns. Where the image and this text disagree, trust the image.

<ocr_text>
${ocrText.slice(0, 6000)}
</ocr_text>`;
}

/* ------------------------------- providers -------------------------------- */

export type ExtractInput = {
  imageBase64: string;
  mimeType: string;
  ocrText?: string | null;
  filename?: string;
};

export type ExtractionProvider = "anthropic" | "mock";

export function configuredProvider(): ExtractionProvider {
  const configured = (process.env.EXTRACTION_PROVIDER ?? "mock").toLowerCase();
  if (configured === "anthropic") {
    // Fall back rather than fail: a missing key shouldn't break the upload.
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : "mock";
  }
  return "mock";
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function extractReceipt(input: ExtractInput): Promise<ExtractionOutcome> {
  const started = Date.now();
  const provider = configuredProvider();

  if (provider === "mock") {
    const extraction = mockExtraction(input);
    return finalise(extraction, "mock", "fixture", started, []);
  }

  if (!SUPPORTED_IMAGE_TYPES.has(input.mimeType)) {
    // The model only takes raster images. An SVG or PDF gets the mock path,
    // which is exactly what the seeded demo dockets need.
    const extraction = mockExtraction(input);
    return finalise(extraction, "mock", "fixture", started, [
      `${input.mimeType} can't be read by the model — a JPEG or PNG photo can.`,
    ]);
  }

  const model = process.env.EXTRACTION_MODEL ?? "claude-opus-5";
  const client = new Anthropic();

  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    // Reading a docket is transcription, not reasoning. Low effort keeps it
    // fast and cheap; raise EXTRACTION_EFFORT if your dockets are shockers.
    output_config: {
      format: zodOutputFormat(ReceiptExtractionSchema),
      effort: (process.env.EXTRACTION_EFFORT as "low" | "medium" | "high") ?? "low",
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: input.imageBase64,
            },
          },
          { type: "text", text: userPrompt(input.ocrText ?? null) },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to read that image.");
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Couldn't make sense of the model's answer. Try the photo again.");
  }

  const extraction = normalise(parsed);
  return finalise(extraction, "anthropic", model, started, []);
}

/* ------------------------------ normalising ------------------------------- */

/** Model output (decimal strings) -> our shape (integer cents). */
export function normalise(raw: ReceiptExtractionRaw): ExtractedReceipt {
  const money = (field: { value: string | null; confidence: number }) => ({
    value: field.value === null ? null : parseMoneyToCents(field.value),
    confidence: field.value === null ? 0 : field.confidence,
    raw: field.value,
  });

  const lineItems: ExtractedLineItem[] = raw.lineItems.map((item) => ({
    description: item.description,
    quantity: item.quantity || "1",
    unitPriceCents: parseMoneyToCents(item.unitPrice ?? "") ?? 0,
    lineTotalCents: parseMoneyToCents(item.lineTotal ?? "") ?? 0,
    confidence: item.confidence,
  }));

  return {
    supplierName: { value: raw.supplierName.value, confidence: raw.supplierName.confidence },
    abn: { value: raw.abn.value, confidence: raw.abn.confidence },
    date: { value: raw.date.value, confidence: raw.date.confidence, raw: raw.date.raw },
    documentNumber: { value: raw.documentNumber.value, confidence: raw.documentNumber.confidence },
    subtotalCents: money(raw.subtotalCents),
    taxCents: money(raw.taxCents),
    totalCents: money(raw.totalCents),
    paymentMethod: { value: raw.paymentMethod.value, confidence: raw.paymentMethod.confidence },
    lineItems,
    notes: raw.notes,
    isReceipt: raw.isReceipt,
  };
}

/**
 * Deterministic checks the model can't be trusted to do itself.
 *
 * A model that transcribes three numbers correctly can still hand back a set
 * that doesn't add up, because it read one of them wrong. Checking the
 * arithmetic here catches exactly that, and the confidence on the offending
 * fields is knocked down so the reviewer's eye goes to them.
 */
export function finalise(
  extraction: ExtractedReceipt,
  provider: string,
  model: string | null,
  started: number,
  warnings: string[],
): ExtractionOutcome {
  const subtotal = extraction.subtotalCents.value;
  const tax = extraction.taxCents.value;
  const total = extraction.totalCents.value;

  let arithmeticOk = true;
  const found = [...warnings];

  if (total !== null && subtotal !== null && tax !== null) {
    if (subtotal + tax !== total) {
      arithmeticOk = false;
      found.push(
        `The numbers don't add up: ${(subtotal / 100).toFixed(2)} + ${(tax / 100).toFixed(2)} should be ${(total / 100).toFixed(2)}. Check each one against the photo.`,
      );
      for (const field of [extraction.subtotalCents, extraction.taxCents, extraction.totalCents]) {
        field.confidence = Math.min(field.confidence, 45);
      }
    }
  } else if (total !== null && subtotal === null && tax !== null) {
    // Subtotal wasn't printed — derive it, and say so.
    extraction.subtotalCents = { value: total - tax, confidence: Math.min(90, extraction.totalCents.confidence), raw: null };
  } else if (total !== null && tax === null && subtotal === null) {
    // No GST line at all. Most AU trade dockets do include GST, so assume the
    // standard split but mark it low so the reviewer confirms.
    const derivedTax = total - exTaxFromInclusive(total, GST_BP);
    extraction.taxCents = { value: derivedTax, confidence: 55, raw: null };
    extraction.subtotalCents = { value: total - derivedTax, confidence: 55, raw: null };
    found.push("No GST line on this docket — we've assumed the usual 1/11th. Check it's right.");
  }

  // Line items that don't sum to the subtotal are a soft signal, not an error:
  // plenty of dockets omit items or show discounts.
  if (extraction.lineItems.length > 0 && subtotal !== null) {
    const lineSum = extraction.lineItems.reduce((a, l) => a + l.lineTotalCents, 0);
    if (Math.abs(lineSum - subtotal) > 100) {
      found.push("The line items don't quite add up to the subtotal — there may be a discount or a line we couldn't read.");
    }
  }

  if (extraction.date.value) {
    const parsed = new Date(`${extraction.date.value}T00:00:00`);
    const now = Date.now();
    if (Number.isNaN(parsed.getTime())) {
      extraction.date.confidence = 0;
      found.push("That date couldn't be read.");
    } else if (parsed.getTime() > now + 86_400_000) {
      extraction.date.confidence = Math.min(extraction.date.confidence, 30);
      found.push("The date reads as being in the future — it's probably been read the American way round.");
    } else if (parsed.getTime() < now - 3 * 365 * 86_400_000) {
      extraction.date.confidence = Math.min(extraction.date.confidence, 40);
      found.push("That date is more than three years ago. Worth a look.");
    }
  }

  if (!extraction.isReceipt) {
    found.push("This doesn't look like a receipt. Check you photographed the right thing.");
  }

  return {
    extraction,
    overallConfidence: scoreExtraction(extraction),
    arithmeticOk,
    provider,
    model,
    elapsedMs: Date.now() - started,
    warnings: found,
  };
}

/* -------------------------------- the mock -------------------------------- */

/**
 * Used when no API key is configured, and for the seeded SVG dockets.
 *
 * It is deliberately imperfect: a couple of fields come back low-confidence so
 * the review screen has something to highlight and the flow can be exercised
 * end to end without spending anything.
 */
function mockExtraction(input: ExtractInput): ExtractedReceipt {
  const seed = [...(input.filename ?? "receipt")].reduce((a, c) => a + c.charCodeAt(0), 0);
  const suppliers = [
    "Bunnings Trade", "Reece", "Dahlsens Building Centre", "Beaumont Tiles",
    "Kennards Hire", "Boral Concrete", "Handy Skips", "Middys Electrical",
  ];
  const supplier = suppliers[seed % suppliers.length]!;
  const totalCents = 8_000 + ((seed * 977) % 240_000);
  const taxCents = totalCents - exTaxFromInclusive(totalCents, GST_BP);
  const shaky = seed % 3 === 0;

  const date = new Date();
  date.setDate(date.getDate() - (seed % 9));

  return {
    supplierName: { value: supplier, confidence: shaky ? 62 : 93 },
    abn: { value: null, confidence: 0 },
    date: { value: date.toISOString().slice(0, 10), confidence: shaky ? 48 : 91, raw: null },
    documentNumber: { value: `D-${(seed * 31) % 100000}`, confidence: 80 },
    subtotalCents: { value: totalCents - taxCents, confidence: 88, raw: null },
    taxCents: { value: taxCents, confidence: 88, raw: null },
    totalCents: { value: totalCents, confidence: 92, raw: null },
    paymentMethod: { value: "EFTPOS", confidence: 70 },
    lineItems: [],
    notes:
      "Read without the model — no ANTHROPIC_API_KEY is set, so these figures are a stand-in. Set EXTRACTION_PROVIDER=anthropic to read the real thing.",
    isReceipt: true,
  };
}
