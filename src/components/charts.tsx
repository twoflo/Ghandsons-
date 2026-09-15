import { formatMoney, formatMoneyShort } from "@/lib/money";

/**
 * Charts for the reports page, drawn as inline SVG.
 *
 * No charting library on purpose: this app has to load on a bar of 4G, and
 * a bar chart is a hundred lines of SVG. Server-rendered means it is on
 * screen with the first paint and works with JavaScript off.
 *
 * Palette and mark specs follow a validated system:
 *   - profit/loss uses the reserved status colours, always paired with a sign
 *     and a label, so colour never carries the meaning on its own
 *   - two-series charts use categorical slots 1 and 2 (blue, orange), which
 *     validate for colour-blind separation, and always carry a legend
 *   - bars are capped at 24px with a 4px rounded data-end and a 2px surface
 *     gap between neighbours; gridlines are hairline and recessive
 * Every chart is followed by the same numbers as text, so nothing is
 * readable only as a picture.
 */

const SURFACE = "#ffffff";
const GRID = "#e2e8f0";
const AXIS_TEXT = "#64748b";

/** Reserved status colours — never reused as a series colour. */
const GOOD = "#0ca30c";
const CRITICAL = "#d03b3b";

/** Categorical slots 1 and 2. */
const SERIES_1 = "#2a78d6";
const SERIES_2 = "#eb6834";

const BAR_MAX = 24;
const BAR_RADIUS = 4;

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/* ------------------------- profit / loss by period ------------------------ */

export function ProfitColumns({
  data,
  caption,
}: {
  data: Array<{ label: string; profitCents: number }>;
  caption: string;
}) {
  if (data.length === 0) return <NoData />;

  const width = Math.max(320, data.length * 56);
  const height = 220;
  const pad = { top: 16, right: 8, bottom: 40, left: 8 };
  const plotH = height - pad.top - pad.bottom;

  const max = niceCeiling(Math.max(1, ...data.map((d) => Math.abs(d.profitCents))));
  const band = (width - pad.left - pad.right) / data.length;
  const barW = Math.min(BAR_MAX, band - 10);
  const zeroY = pad.top + plotH / 2;
  const scale = (cents: number) => (Math.abs(cents) / max) * (plotH / 2);

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={caption}
          style={{ minWidth: width }}
        >
          <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke={GRID} strokeWidth={1} />
          {data.map((point, i) => {
            const h = Math.max(2, scale(point.profitCents));
            const x = pad.left + i * band + (band - barW) / 2;
            const positive = point.profitCents >= 0;
            const y = positive ? zeroY - h : zeroY;
            return (
              <g key={point.label}>
                <title>
                  {point.label}: {positive ? "profit" : "loss"} {formatMoney(Math.abs(point.profitCents))}
                </title>
                <path
                  d={
                    positive
                      ? roundedTop(x, y, barW, h, BAR_RADIUS)
                      : roundedBottom(x, y, barW, h, BAR_RADIUS)
                  }
                  fill={positive ? GOOD : CRITICAL}
                />
                <text
                  x={x + barW / 2}
                  y={height - pad.bottom + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fill={AXIS_TEXT}
                >
                  {point.label}
                </text>
                <text
                  x={x + barW / 2}
                  y={positive ? y - 5 : y + h + 13}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={AXIS_TEXT}
                >
                  {point.profitCents < 0 ? "−" : ""}
                  {formatMoneyShort(Math.abs(point.profitCents))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-1 text-sm text-ink-500">
        {caption}. Green bars above the line are profit; red below is a loss.
      </figcaption>
    </figure>
  );
}

/* ---------------------------- two-series columns -------------------------- */

export function PairedColumns({
  data,
  seriesA,
  seriesB,
  caption,
}: {
  data: Array<{ label: string; a: number; b: number }>;
  seriesA: string;
  seriesB: string;
  caption: string;
}) {
  if (data.length === 0) return <NoData />;

  const width = Math.max(340, data.length * 64);
  const height = 240;
  const pad = { top: 16, right: 8, bottom: 40, left: 52 };
  const plotH = height - pad.top - pad.bottom;
  const plotW = width - pad.left - pad.right;

  const max = niceCeiling(Math.max(1, ...data.flatMap((d) => [d.a, d.b])));
  const band = plotW / data.length;
  // Two bars side by side, with the 2px surface gap between them.
  const barW = Math.min(BAR_MAX, (band - 14) / 2);
  const scale = (cents: number) => (cents / max) * plotH;
  const ticks = [0, max / 2, max];

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap gap-4">
        <LegendKey colour={SERIES_1} label={seriesA} />
        <LegendKey colour={SERIES_2} label={seriesB} />
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={caption}
          style={{ minWidth: width }}
        >
          {ticks.map((tick) => {
            const y = pad.top + plotH - scale(tick);
            return (
              <g key={tick}>
                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={GRID} strokeWidth={1} />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill={AXIS_TEXT}>
                  {formatMoneyShort(tick)}
                </text>
              </g>
            );
          })}

          {data.map((point, i) => {
            const groupX = pad.left + i * band + (band - (barW * 2 + 2)) / 2;
            const ha = Math.max(1, scale(point.a));
            const hb = Math.max(1, scale(point.b));
            return (
              <g key={point.label}>
                <title>
                  {point.label}: {seriesA} {formatMoney(point.a)}, {seriesB} {formatMoney(point.b)}
                </title>
                <path
                  d={roundedTop(groupX, pad.top + plotH - ha, barW, ha, BAR_RADIUS)}
                  fill={SERIES_1}
                />
                <path
                  d={roundedTop(groupX + barW + 2, pad.top + plotH - hb, barW, hb, BAR_RADIUS)}
                  fill={SERIES_2}
                />
                <text
                  x={groupX + barW + 1}
                  y={height - pad.bottom + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fill={AXIS_TEXT}
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-1 text-sm text-ink-500">{caption}</figcaption>
    </figure>
  );
}

/* ----------------------------- horizontal bars ---------------------------- */

export function ProfitBars({
  data,
  caption,
}: {
  data: Array<{ label: string; sublabel?: string; profitCents: number }>;
  caption: string;
}) {
  if (data.length === 0) return <NoData />;

  const rowH = 34;
  const labelW = 160;
  const width = 640;
  const height = data.length * rowH + 16;
  const max = niceCeiling(Math.max(1, ...data.map((d) => Math.abs(d.profitCents))));
  const plotW = width - labelW - 90;
  const hasLoss = data.some((d) => d.profitCents < 0);
  const zeroX = hasLoss ? labelW + plotW / 2 : labelW;
  const usable = hasLoss ? plotW / 2 : plotW;
  const barH = Math.min(BAR_MAX, rowH - 12);

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={caption}
          style={{ minWidth: 480 }}
        >
          <line x1={zeroX} y1={0} x2={zeroX} y2={height - 8} stroke={GRID} strokeWidth={1} />
          {data.map((row, i) => {
            const y = i * rowH + 8;
            const w = Math.max(2, (Math.abs(row.profitCents) / max) * usable);
            const positive = row.profitCents >= 0;
            const x = positive ? zeroX : zeroX - w;
            return (
              <g key={`${row.label}-${i}`}>
                <title>
                  {row.label}: {positive ? "profit" : "loss"} {formatMoney(Math.abs(row.profitCents))}
                </title>
                <text x={0} y={y + barH / 2 + 4} fontSize={12} fill="#1e293b" fontWeight={600}>
                  {row.label.length > 24 ? `${row.label.slice(0, 23)}…` : row.label}
                </text>
                <path
                  d={
                    positive
                      ? roundedRight(x, y, w, barH, BAR_RADIUS)
                      : roundedLeft(x, y, w, barH, BAR_RADIUS)
                  }
                  fill={positive ? GOOD : CRITICAL}
                />
                <text
                  x={positive ? x + w + 8 : x - 8}
                  y={y + barH / 2 + 4}
                  textAnchor={positive ? "start" : "end"}
                  fontSize={11}
                  fontWeight={700}
                  fill={AXIS_TEXT}
                >
                  {positive ? "" : "−"}
                  {formatMoneyShort(Math.abs(row.profitCents))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-1 text-sm text-ink-500">{caption}</figcaption>
    </figure>
  );
}

/* ------------------------------- aged bars -------------------------------- */

/** Ordinal blue ramp: the further overdue, the darker. Validated as an ordinal scale. */
const AGE_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];

export function AgedBars({
  buckets,
  caption,
}: {
  buckets: Array<{ label: string; cents: number; count: number }>;
  caption: string;
}) {
  const total = buckets.reduce((a, b) => a + b.cents, 0);
  if (total === 0) return <NoData message="Nothing outstanding — everyone's paid up." />;

  return (
    <figure className="m-0">
      <div
        className="flex h-8 w-full overflow-hidden rounded-lg"
        role="img"
        aria-label={caption}
      >
        {buckets.map((bucket, i) =>
          bucket.cents > 0 ? (
            <div
              key={bucket.label}
              title={`${bucket.label}: ${formatMoney(bucket.cents)} across ${bucket.count} invoices`}
              style={{
                width: `${(bucket.cents / total) * 100}%`,
                background: AGE_RAMP[i] ?? AGE_RAMP[AGE_RAMP.length - 1],
                // The 2px surface gap between touching segments.
                marginRight: i < buckets.length - 1 ? 2 : 0,
              }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {buckets.map((bucket, i) => (
          <li key={bucket.label} className="flex items-baseline gap-2">
            <span
              className="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm"
              style={{ background: AGE_RAMP[i] ?? AGE_RAMP[AGE_RAMP.length - 1] }}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink-700">{bucket.label}</span>
              <span className="tabular block font-bold text-ink-900">{formatMoney(bucket.cents)}</span>
              <span className="block text-xs text-ink-500">
                {bucket.count} invoice{bucket.count === 1 ? "" : "s"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-2 text-sm text-ink-500">{caption}</figcaption>
    </figure>
  );
}

/* --------------------------------- pieces --------------------------------- */

function LegendKey({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm font-semibold text-ink-700">
      <span className="inline-block h-3 w-3 rounded-sm" style={{ background: colour }} aria-hidden="true" />
      {label}
    </span>
  );
}

function NoData({ message = "Nothing to show for this period yet." }: { message?: string }) {
  return (
    <p className="rounded-lg border-2 border-dashed border-ink-300 px-4 py-8 text-center text-ink-600">
      {message}
    </p>
  );
}

/* Rounded on the data end, square at the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`;
}

function roundedBottom(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y} L${x},${y + h - radius} Q${x},${y + h} ${x + radius},${y + h} L${x + w - radius},${y + h} Q${x + w},${y + h} ${x + w},${y + h - radius} L${x + w},${y} Z`;
}

function roundedRight(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w, h / 2);
  return `M${x},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h - radius} Q${x + w},${y + h} ${x + w - radius},${y + h} L${x},${y + h} Z`;
}

function roundedLeft(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w, h / 2);
  return `M${x + w},${y} L${x + radius},${y} Q${x},${y} ${x},${y + radius} L${x},${y + h - radius} Q${x},${y + h} ${x + radius},${y + h} L${x + w},${y + h} Z`;
}

export { SURFACE, GOOD, CRITICAL, SERIES_1, SERIES_2 };
