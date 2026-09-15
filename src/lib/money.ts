/**
 * Money is integer cents, always. No float ever touches a stored amount.
 *
 * Rates are basis points: 1000 bp = 10.00%. Integer maths end to end means
 * $0.01 differences between the screen, the PDF and the database are
 * impossible by construction.
 */

export const GST_BP = 1000;

/** Round half away from zero, the convention the ATO and every invoice uses. */
export function roundHalf(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** cost 10000 (=$100) with markup 2000 bp (=20%) -> 12000 (=$120). */
export function applyMarkup(costCents: number, markupBp: number): number {
  return roundHalf(costCents * (10_000 + markupBp) / 10_000);
}

/** The inverse: what margin does this price represent over this cost? */
export function marginBp(costCents: number, priceCents: number): number {
  if (priceCents === 0) return 0;
  return roundHalf(((priceCents - costCents) / priceCents) * 10_000);
}

/** GST on an ex-tax amount. 10000 @ 1000bp -> 1000. */
export function taxOn(exTaxCents: number, rateBp: number): number {
  return roundHalf((exTaxCents * rateBp) / 10_000);
}

/** Strip GST out of a tax-inclusive amount. $110 inc -> $100 ex. */
export function exTaxFromInclusive(incTaxCents: number, rateBp: number): number {
  return roundHalf((incTaxCents * 10_000) / (10_000 + rateBp));
}

/** GST component of a tax-inclusive amount. On an AU tax invoice this is total/11. */
export function taxFromInclusive(incTaxCents: number, rateBp: number): number {
  return incTaxCents - exTaxFromInclusive(incTaxCents, rateBp);
}

/** qty is a decimal string ("2.5"); the result is exact cents. */
export function lineTotal(quantity: string | number, unitAmountCents: number): number {
  const qty = typeof quantity === "number" ? quantity : Number.parseFloat(quantity || "0");
  if (!Number.isFinite(qty)) return 0;
  return roundHalf(qty * unitAmountCents);
}

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

const AUD_WHOLE = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

/** 123456 -> "$1,234.56" */
export function formatMoney(cents: number | null | undefined): string {
  return AUD.format((cents ?? 0) / 100);
}

/**
 * Rounded, for dashboard tiles where the cents are noise.
 *   123456      -> "$1,235"
 *   18_262_600  -> "$182.6k"
 *   32_850_000_0 -> "$3.3m"
 */
export function formatMoneyShort(cents: number | null | undefined): string {
  const v = cents ?? 0;
  const abs = Math.abs(v);
  if (abs >= 100_000_000) return `$${trim(v / 100_000_000)}m`;   // >= $1,000,000
  if (abs >= 1_000_000) return `$${trim(v / 100_000)}k`;         // >= $10,000
  return AUD_WHOLE.format(v / 100);
}

function trim(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/** "1,234.56" | "$1234.5" | "1234" -> 123456. Returns null if unparseable. */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return roundHalf(input * 100);
  }
  const cleaned = input.trim().replace(/[$\s,]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "" || cleaned === "-") return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;
  return roundHalf(value * 100);
}

/** For <input type="number" step="0.01"> round-trips. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

export function formatBp(basisPoints: number | null | undefined): string {
  const v = (basisPoints ?? 0) / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2)}%`;
}

export function parseBp(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number.parseFloat(String(input).replace("%", "").trim());
  if (!Number.isFinite(n)) return null;
  return roundHalf(n * 100);
}

export function formatHours(minutes: number | null | undefined): string {
  const m = minutes ?? 0;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/** Decimal hours for timesheet maths: 90 -> 1.5 */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function costForMinutes(minutes: number, rateCentsPerHour: number): number {
  return roundHalf((minutes / 60) * rateCentsPerHour);
}
