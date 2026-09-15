import { applyMarkup, taxOn, lineTotal, roundHalf } from "@/lib/money";

/**
 * The one place quote, variation and PO line money is worked out.
 *
 * The chain is always: unit COST -> markup -> unit PRICE -> line subtotal ->
 * GST -> line total. Tax is calculated per line and summed, never taken as a
 * percentage of the document total — that way a GST-free line (rare, but it
 * happens on some government work) doesn't quietly pick up 10%.
 */

export type LineKind = "labour" | "material" | "subcontractor" | "plant" | "other";

export type RawLine = {
  id?: string;
  sortOrder: number;
  isHeading?: boolean;
  kind: LineKind;
  description: string;
  quantity: string;
  unit: string;
  unitCostCents: number;
  /** null means "use the document's global markup". */
  markupBp: number | null;
  taxRateBp: number;
  taxRateId?: string | null;
  priceBookItemId?: string | null;
  notes?: string | null;
};

export type CalculatedLine = RawLine & {
  effectiveMarkupBp: number;
  unitPriceCents: number;
  lineCostCents: number;
  lineSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
};

export type DocumentTotals = {
  costTotalCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  grossProfitCents: number;
  marginBp: number;
};

export function calculateLine(line: RawLine, globalMarkupBp: number): CalculatedLine {
  if (line.isHeading) {
    return {
      ...line,
      effectiveMarkupBp: 0,
      unitPriceCents: 0,
      lineCostCents: 0,
      lineSubtotalCents: 0,
      lineTaxCents: 0,
      lineTotalCents: 0,
    };
  }

  const effectiveMarkupBp = line.markupBp ?? globalMarkupBp;
  const unitPriceCents = applyMarkup(line.unitCostCents, effectiveMarkupBp);
  const lineCostCents = lineTotal(line.quantity, line.unitCostCents);
  const lineSubtotalCents = lineTotal(line.quantity, unitPriceCents);
  const lineTaxCents = taxOn(lineSubtotalCents, line.taxRateBp);

  return {
    ...line,
    effectiveMarkupBp,
    unitPriceCents,
    lineCostCents,
    lineSubtotalCents,
    lineTaxCents,
    lineTotalCents: lineSubtotalCents + lineTaxCents,
  };
}

export function calculateDocument(lines: RawLine[], globalMarkupBp: number) {
  const calculated = lines.map((line) => calculateLine(line, globalMarkupBp));

  const totals = calculated.reduce<DocumentTotals>(
    (acc, line) => ({
      costTotalCents: acc.costTotalCents + line.lineCostCents,
      subtotalCents: acc.subtotalCents + line.lineSubtotalCents,
      taxCents: acc.taxCents + line.lineTaxCents,
      totalCents: acc.totalCents + line.lineTotalCents,
      grossProfitCents: 0,
      marginBp: 0,
    }),
    { costTotalCents: 0, subtotalCents: 0, taxCents: 0, totalCents: 0, grossProfitCents: 0, marginBp: 0 },
  );

  totals.grossProfitCents = totals.subtotalCents - totals.costTotalCents;
  totals.marginBp =
    totals.subtotalCents > 0
      ? roundHalf((totals.grossProfitCents / totals.subtotalCents) * 10_000)
      : 0;

  return { lines: calculated, totals };
}

/** Cost per budget bucket — what an accepted quote hands the job. */
export function budgetFromLines(lines: CalculatedLine[]) {
  const bucket = { labour: 0, material: 0, subcontractor: 0, plant: 0, other: 0 };
  for (const line of lines) bucket[line.kind] += line.lineCostCents;
  return {
    budgetLabourCents: bucket.labour,
    budgetMaterialCents: bucket.material,
    budgetSubcontractorCents: bucket.subcontractor,
    budgetPlantCents: bucket.plant,
    budgetOtherCents: bucket.other,
  };
}

/**
 * Spreading a total across lines without losing a cent to rounding: every
 * line gets its proportional share, and the remainder lands on the largest
 * line rather than vanishing.
 */
export function distribute(totalCents: number, weights: number[]): number[] {
  const weightSum = weights.reduce((a, w) => a + w, 0);
  if (weightSum === 0 || weights.length === 0) return weights.map(() => 0);

  const shares = weights.map((w) => Math.floor((totalCents * w) / weightSum));
  const allocated = shares.reduce((a, s) => a + s, 0);
  let remainder = totalCents - allocated;

  // Hand the leftover cents out, biggest line first.
  const order = weights
    .map((w, i) => ({ i, w }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.i);

  let cursor = 0;
  while (remainder > 0 && order.length > 0) {
    shares[order[cursor % order.length]!]! += 1;
    remainder -= 1;
    cursor += 1;
  }
  return shares;
}
