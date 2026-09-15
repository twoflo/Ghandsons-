import { describe, it, expect } from "vitest";
import {
  applyMarkup, taxOn, exTaxFromInclusive, taxFromInclusive, parseMoneyToCents,
  formatMoney, formatMoneyShort, marginBp, costForMinutes, roundHalf,
} from "../src/lib/money";
import { calculateDocument, distribute } from "../src/modules/quotes/calc";

describe("money", () => {
  it("rounds half away from zero", () => {
    expect(roundHalf(0.5)).toBe(1);
    expect(roundHalf(-0.5)).toBe(-1);
    expect(roundHalf(2.4)).toBe(2);
  });

  it("applies markup in basis points", () => {
    expect(applyMarkup(10_000, 2000)).toBe(12_000);
    expect(applyMarkup(6_200, 5500)).toBe(9_610);
    expect(applyMarkup(0, 5000)).toBe(0);
  });

  it("calculates GST on an ex-tax amount", () => {
    expect(taxOn(10_000, 1000)).toBe(1_000);
    expect(taxOn(4_995, 1000)).toBe(500); // 499.5 rounds up
    expect(taxOn(10_000, 0)).toBe(0);
  });

  it("splits a tax-inclusive amount the way an AU tax invoice does", () => {
    expect(exTaxFromInclusive(11_000, 1000)).toBe(10_000);
    expect(taxFromInclusive(11_000, 1000)).toBe(1_000);
    // total/11 for any inclusive amount
    expect(taxFromInclusive(54_006, 1000)).toBe(4_910);
    expect(exTaxFromInclusive(54_006, 1000) + taxFromInclusive(54_006, 1000)).toBe(54_006);
  });

  it("never loses a cent splitting inclusive amounts", () => {
    for (let total = 1; total < 5000; total += 7) {
      expect(exTaxFromInclusive(total, 1000) + taxFromInclusive(total, 1000)).toBe(total);
    }
  });

  it("parses whatever the owner types", () => {
    expect(parseMoneyToCents("1,234.56")).toBe(123_456);
    expect(parseMoneyToCents("$1234.5")).toBe(123_450);
    expect(parseMoneyToCents(" 90 ")).toBe(9_000);
    expect(parseMoneyToCents("(50)")).toBe(-5_000);
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("12.345")).toBe(1_235);
  });

  it("formats Australian dollars", () => {
    expect(formatMoney(123_456)).toBe("$1,234.56");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(null)).toBe("$0.00");
  });

  it("shortens big numbers without inventing magnitudes", () => {
    expect(formatMoneyShort(123_456)).toBe("$1,235");
    expect(formatMoneyShort(1_000_000)).toBe("$10k");
    expect(formatMoneyShort(18_262_600)).toBe("$182.6k");
    expect(formatMoneyShort(30_694_692)).toBe("$306.9k");
    expect(formatMoneyShort(100_000_000)).toBe("$1m");
    expect(formatMoneyShort(328_500_000)).toBe("$3.3m");
  });

  it("derives margin from cost and price", () => {
    expect(marginBp(8_000, 10_000)).toBe(2000);
    expect(marginBp(10_000, 10_000)).toBe(0);
    expect(marginBp(0, 0)).toBe(0);
  });

  it("costs a shift to the cent", () => {
    expect(costForMinutes(480, 6_200)).toBe(49_600);
    expect(costForMinutes(450, 2_800)).toBe(21_000);
    expect(costForMinutes(0, 6_200)).toBe(0);
  });
});

describe("document totals", () => {
  const line = (over: Partial<Parameters<typeof calculateDocument>[0][number]> = {}) => ({
    sortOrder: 0, kind: "material" as const, description: "x", quantity: "1",
    unit: "ea", unitCostCents: 10_000, markupBp: null, taxRateBp: 1000, ...over,
  });

  it("uses the global markup when a line has none", () => {
    const { lines } = calculateDocument([line()], 2000);
    expect(lines[0]!.unitPriceCents).toBe(12_000);
  });

  it("lets a line override the global markup", () => {
    const { lines } = calculateDocument([line({ markupBp: 5000 })], 2000);
    expect(lines[0]!.unitPriceCents).toBe(15_000);
  });

  it("sums tax per line so a GST-free line stays GST-free", () => {
    const { totals } = calculateDocument(
      [line(), line({ sortOrder: 1, taxRateBp: 0 })],
      2000,
    );
    expect(totals.subtotalCents).toBe(24_000);
    expect(totals.taxCents).toBe(1_200); // only the first line is taxed
    expect(totals.totalCents).toBe(25_200);
  });

  it("reports margin against the sell price, not the cost", () => {
    const { totals } = calculateDocument([line()], 2500);
    expect(totals.costTotalCents).toBe(10_000);
    expect(totals.subtotalCents).toBe(12_500);
    expect(totals.grossProfitCents).toBe(2_500);
    expect(totals.marginBp).toBe(2000); // 2500/12500
  });

  it("gives headings no money at all", () => {
    const { totals } = calculateDocument(
      [line({ isHeading: true, description: "Bathroom" }), line({ sortOrder: 1 })],
      2000,
    );
    expect(totals.subtotalCents).toBe(12_000);
  });

  it("handles fractional quantities exactly", () => {
    const { lines } = calculateDocument(
      [line({ quantity: "2.5", unitCostCents: 9_200, markupBp: 1500 })],
      0,
    );
    expect(lines[0]!.unitPriceCents).toBe(10_580);
    expect(lines[0]!.lineSubtotalCents).toBe(26_450);
  });
});

describe("distribute", () => {
  it("never loses or invents a cent", () => {
    expect(distribute(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(distribute(1000, [3, 1])).toEqual([750, 250]);
    expect(distribute(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it("copes with zero weights", () => {
    expect(distribute(500, [0, 0])).toEqual([0, 0]);
    expect(distribute(0, [5, 5])).toEqual([0, 0]);
  });
});
