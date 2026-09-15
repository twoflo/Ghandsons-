import { randomUUID } from "node:crypto";
import { db } from "../index";
import { files } from "../schema";
import { putObject } from "../../lib/storage";
import { taxOn, applyMarkup, lineTotal, roundHalf } from "../../lib/money";

/** Deterministic pseudo-random so a reseed produces the same demo data. */
let seedState = 0x2f6e2b1;
export function rand(): number {
  seedState ^= seedState << 13;
  seedState ^= seedState >>> 17;
  seedState ^= seedState << 5;
  return Math.abs(seedState % 1_000_000) / 1_000_000;
}
export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length) % items.length]!;
}
export function between(min: number, max: number): number {
  return Math.floor(min + rand() * (max - min + 1));
}

/** Stores bytes and returns the new files.id. */
export async function storeFile(opts: {
  prefix: string;
  filename: string;
  body: string | Buffer;
  mimeType: string;
  uploadedBy?: string | null;
  width?: number;
  height?: number;
}): Promise<string> {
  const buffer = typeof opts.body === "string" ? Buffer.from(opts.body, "utf8") : opts.body;
  const stored = await putObject(opts.prefix, opts.filename, buffer, opts.mimeType);
  const [row] = await db
    .insert(files)
    .values({
      storageKey: stored.storageKey,
      storageDriver: stored.storageDriver,
      filename: opts.filename,
      mimeType: opts.mimeType,
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256,
      width: opts.width ?? null,
      height: opts.height ?? null,
      uploadedBy: opts.uploadedBy ?? null,
    })
    .returning({ id: files.id });
  return row!.id;
}

/* --------------------------- line-total arithmetic -------------------------- */

export type LineSpec = {
  kind: "labour" | "material" | "subcontractor" | "plant" | "other";
  description: string;
  qty: number;
  unit: string;
  /** Dollars, for readability in the seed. Converted to cents here. */
  unitCost: number;
  markupBp?: number;
  taxable?: boolean;
};

export type CostedLine = {
  kind: LineSpec["kind"];
  description: string;
  quantity: string;
  unit: string;
  unitCostCents: number;
  markupBp: number | null;
  unitPriceCents: number;
  lineCostCents: number;
  lineSubtotalCents: number;
  lineTaxCents: number;
  lineTotalCents: number;
  taxable: boolean;
};

/**
 * The single place quote/variation line money is worked out, mirroring
 * src/modules/quotes/calc.ts so the seed can never disagree with the app.
 */
export function costLines(specs: LineSpec[], globalMarkupBp: number, gstBp: number): CostedLine[] {
  return specs.map((spec) => {
    const unitCostCents = roundHalf(spec.unitCost * 100);
    const markup = spec.markupBp ?? null;
    const effectiveMarkup = markup ?? globalMarkupBp;
    const unitPriceCents = applyMarkup(unitCostCents, effectiveMarkup);
    const taxable = spec.taxable !== false;
    const lineSubtotalCents = lineTotal(spec.qty, unitPriceCents);
    const lineTaxCents = taxable ? taxOn(lineSubtotalCents, gstBp) : 0;
    return {
      kind: spec.kind,
      description: spec.description,
      quantity: String(spec.qty),
      unit: spec.unit,
      unitCostCents,
      markupBp: markup,
      unitPriceCents,
      lineCostCents: lineTotal(spec.qty, unitCostCents),
      lineSubtotalCents,
      lineTaxCents,
      lineTotalCents: lineSubtotalCents + lineTaxCents,
      taxable,
    };
  });
}

export function sumLines(lines: CostedLine[]) {
  return lines.reduce(
    (acc, l) => ({
      costTotalCents: acc.costTotalCents + l.lineCostCents,
      subtotalCents: acc.subtotalCents + l.lineSubtotalCents,
      taxCents: acc.taxCents + l.lineTaxCents,
      totalCents: acc.totalCents + l.lineTotalCents,
    }),
    { costTotalCents: 0, subtotalCents: 0, taxCents: 0, totalCents: 0 },
  );
}

/** Dollars -> cents, for readability in seed literals. */
export const $ = (dollars: number) => roundHalf(dollars * 100);

export const uid = () => randomUUID();
