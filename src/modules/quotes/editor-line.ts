import type { RawLine, LineKind } from "./calc";

/** A quote/variation line while it's being edited: a RawLine plus a stable React key. */
export type EditorLine = RawLine & { key: string };

export const LINE_KINDS: LineKind[] = ["labour", "material", "subcontractor", "plant", "other"];

/**
 * A blank line. Lives outside the client component so server pages can seed
 * a fresh form without importing client code.
 */
export function newLine(
  sortOrder: number,
  defaultTaxRateId: string | null,
  taxRateBp: number,
): EditorLine {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    sortOrder,
    isHeading: false,
    kind: "material",
    description: "",
    quantity: "1",
    unit: "ea",
    unitCostCents: 0,
    markupBp: null,
    taxRateId: defaultTaxRateId,
    taxRateBp,
    priceBookItemId: null,
  };
}
