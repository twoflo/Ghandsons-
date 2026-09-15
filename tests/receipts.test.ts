import { describe, it, expect } from "vitest";
import { normalise, finalise } from "../src/lib/receipts/extract";
import { scoreExtraction, LOW_CONFIDENCE, type ExtractedReceipt } from "../src/lib/receipts/types";
import type { ReceiptExtractionRaw } from "../src/lib/receipts/schema";

function raw(over: Partial<ReceiptExtractionRaw> = {}): ReceiptExtractionRaw {
  return {
    isReceipt: true,
    supplierName: { value: "Bunnings Trade", confidence: 96 },
    abn: { value: "26 008 672 179", confidence: 92 },
    date: { value: "2026-09-14", confidence: 94, raw: "14/09/2026" },
    documentNumber: { value: "M10-772104", confidence: 88 },
    subtotalCents: { value: "144.55", confidence: 93 },
    taxCents: { value: "14.45", confidence: 93 },
    totalCents: { value: "159.00", confidence: 97 },
    paymentMethod: { value: "EFTPOS VISA ****4412", confidence: 80 },
    lineItems: [
      { description: "CEMENT GP 20KG", quantity: "6", unitPrice: "12.90", lineTotal: "77.40", confidence: 90 },
      { description: "SAND BRICKIES 20KG", quantity: "4", unitPrice: "9.50", lineTotal: "38.00", confidence: 90 },
      { description: "TROWEL 250MM", quantity: "1", unitPrice: "29.15", lineTotal: "29.15", confidence: 90 },
    ],
    notes: null,
    ...over,
  };
}

const run = (over: Partial<ReceiptExtractionRaw> = {}) =>
  finalise(normalise(raw(over)), "test", null, Date.now(), []);

describe("normalise", () => {
  it("turns printed decimals into integer cents", () => {
    const e = normalise(raw());
    expect(e.subtotalCents.value).toBe(14_455);
    expect(e.taxCents.value).toBe(1_445);
    expect(e.totalCents.value).toBe(15_900);
  });

  it("keeps what was printed alongside the parsed date", () => {
    const e = normalise(raw());
    expect(e.date.value).toBe("2026-09-14");
    expect(e.date.raw).toBe("14/09/2026");
  });

  it("zeroes the confidence of a field that wasn't on the receipt", () => {
    const e = normalise(raw({ subtotalCents: { value: null, confidence: 70 } }));
    expect(e.subtotalCents.value).toBeNull();
    expect(e.subtotalCents.confidence).toBe(0);
  });

  it("converts line items to cents", () => {
    const e = normalise(raw());
    expect(e.lineItems).toHaveLength(3);
    expect(e.lineItems[0]!.unitPriceCents).toBe(1_290);
    expect(e.lineItems[2]!.lineTotalCents).toBe(2_915);
    expect(e.lineItems[0]!.lineTotalCents).toBe(7_740);
  });
});

describe("finalise — arithmetic checks", () => {
  it("passes a receipt that adds up", () => {
    const out = run();
    expect(out.arithmeticOk).toBe(true);
    expect(out.warnings).toHaveLength(0);
    expect(out.overallConfidence).toBeGreaterThan(90);
  });

  it("catches a misread digit and drops the confidence on all three amounts", () => {
    // 144.55 + 14.45 should be 159.00, not 189.00.
    const out = run({ totalCents: { value: "189.00", confidence: 97 } });
    expect(out.arithmeticOk).toBe(false);
    expect(out.warnings[0]).toContain("don't add up");
    expect(out.extraction.subtotalCents.confidence).toBeLessThanOrEqual(45);
    expect(out.extraction.taxCents.confidence).toBeLessThanOrEqual(45);
    expect(out.extraction.totalCents.confidence).toBeLessThanOrEqual(45);
    // The queue should put this one near the front.
    expect(out.overallConfidence).toBeLessThan(LOW_CONFIDENCE);
  });

  it("derives a subtotal the docket didn't print", () => {
    const out = run({ subtotalCents: { value: null, confidence: 0 } });
    expect(out.extraction.subtotalCents.value).toBe(14_455);
    expect(out.arithmeticOk).toBe(true);
  });

  it("assumes the usual 1/11th when no GST line is shown, and says so", () => {
    const out = run({
      subtotalCents: { value: null, confidence: 0 },
      taxCents: { value: null, confidence: 0 },
      totalCents: { value: "110.00", confidence: 95 },
    });
    expect(out.extraction.taxCents.value).toBe(1_000);
    expect(out.extraction.subtotalCents.value).toBe(10_000);
    // Flagged low so a human confirms it.
    expect(out.extraction.taxCents.confidence).toBeLessThan(LOW_CONFIDENCE);
    expect(out.warnings.join(" ")).toContain("assumed the usual 1/11th");
  });

  it("notes when the line items don't reach the subtotal", () => {
    const out = run({
      lineItems: [
        { description: "CEMENT GP 20KG", quantity: "6", unitPrice: "12.90", lineTotal: "77.40", confidence: 90 },
      ],
    });
    expect(out.warnings.join(" ")).toContain("don't quite add up");
  });

  it("ignores small line-item rounding differences", () => {
    const out = run({
      lineItems: [
        { description: "Everything", quantity: "1", unitPrice: "144.00", lineTotal: "144.00", confidence: 90 },
      ],
    });
    expect(out.warnings.join(" ")).not.toContain("don't quite add up");
  });
});

describe("finalise — date sanity", () => {
  it("flags a date in the future as probably read the American way round", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const out = run({ date: { value: future.toISOString().slice(0, 10), confidence: 90, raw: "03/09/2027" } });
    expect(out.extraction.date.confidence).toBeLessThanOrEqual(30);
    expect(out.warnings.join(" ")).toContain("American way round");
  });

  it("flags a date years in the past", () => {
    const out = run({ date: { value: "2018-04-01", confidence: 90, raw: "01/04/2018" } });
    expect(out.extraction.date.confidence).toBeLessThanOrEqual(40);
    expect(out.warnings.join(" ")).toContain("three years ago");
  });

  it("rejects an unparseable date outright", () => {
    const out = run({ date: { value: "2026-13-45", confidence: 90, raw: "??" } });
    expect(out.extraction.date.confidence).toBe(0);
  });

  it("accepts a normal recent date", () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 2);
    const out = run({ date: { value: recent.toISOString().slice(0, 10), confidence: 93, raw: "" } });
    expect(out.extraction.date.confidence).toBe(93);
  });
});

describe("finalise — not a receipt", () => {
  it("says so when the photo isn't a receipt", () => {
    const out = run({ isReceipt: false });
    expect(out.warnings.join(" ")).toContain("doesn't look like a receipt");
  });
});

describe("scoreExtraction", () => {
  const withConfidences = (values: number[]): ExtractedReceipt => ({
    supplierName: { value: "x", confidence: values[0]! },
    abn: { value: null, confidence: 0 },
    date: { value: "2026-09-01", confidence: values[1]! },
    documentNumber: { value: null, confidence: 0 },
    subtotalCents: { value: 100, confidence: values[2]! },
    taxCents: { value: 10, confidence: values[3]! },
    totalCents: { value: 110, confidence: values[4]! },
    paymentMethod: { value: null, confidence: 0 },
    lineItems: [],
    notes: null,
    isReceipt: true,
  });

  it("is dragged down by the weakest field, not averaged away", () => {
    const allGood = scoreExtraction(withConfidences([95, 95, 95, 95, 95]));
    const oneBad = scoreExtraction(withConfidences([95, 20, 95, 95, 95]));
    expect(allGood).toBe(95);
    // A plain mean would give 80; the weighting must punish the outlier harder.
    expect(oneBad).toBeLessThan(80);
    expect(oneBad).toBeGreaterThan(20);
  });

  it("scores a clean read high enough to skip a careful look", () => {
    expect(scoreExtraction(withConfidences([98, 96, 97, 97, 99]))).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
  });
});
