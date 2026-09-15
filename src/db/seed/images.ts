/**
 * Seed imagery.
 *
 * Demo receipts and site photos are generated as SVG so the repo stays small
 * and every screen has something real to show without shipping binaries.
 * They render in an <img> exactly like a phone photo would.
 *
 * Note: the `anthropic` extraction provider needs a raster image (JPEG/PNG),
 * which is what a real phone upload is. The seeded SVG dockets are there for
 * the `mock` provider and for eyeballing the review screen.
 */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type ReceiptSpec = {
  supplier: string;
  abn: string;
  address: string;
  date: string;
  time: string;
  docket: string;
  lines: Array<{ description: string; qty: string; each: string; total: string }>;
  subtotal: string;
  gst: string;
  total: string;
  payment: string;
  /** Adds creases, a coffee ring and a slight rotation, like a real ute-floor docket. */
  crumpled?: boolean;
};

/** A thermal-printer docket, photographed on a tailgate. */
export function receiptSvg(spec: ReceiptSpec): string {
  const lineHeight = 17;
  const headerBottom = 176;
  const bodyHeight = spec.lines.length * lineHeight;
  const footerHeight = 150;
  const height = headerBottom + bodyHeight + footerHeight;
  const width = 420;
  const rotate = spec.crumpled ? -1.4 : 0.4;

  const lineRows = spec.lines
    .map((line, i) => {
      const y = headerBottom + i * lineHeight;
      return `
    <text x="26" y="${y}" class="m">${esc(line.description.slice(0, 26))}</text>
    <text x="268" y="${y}" class="m r">${esc(line.qty)}</text>
    <text x="330" y="${y}" class="m r">${esc(line.each)}</text>
    <text x="396" y="${y}" class="m r">${esc(line.total)}</text>`;
    })
    .join("");

  const footTop = headerBottom + bodyHeight + 10;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Receipt from ${esc(spec.supplier)}">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fdfdfb"/>
      <stop offset="55%" stop-color="#f6f5f0"/>
      <stop offset="100%" stop-color="#eceae2"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="1.6"/></filter>
  </defs>
  <style>
    .m { font-family: "Courier New", ui-monospace, monospace; font-size: 12px; fill: #2b2b2b; }
    .b { font-family: "Courier New", ui-monospace, monospace; font-size: 12px; font-weight: bold; fill: #1a1a1a; }
    .h { font-family: "Courier New", ui-monospace, monospace; font-size: 19px; font-weight: bold; fill: #141414; letter-spacing: 1px; }
    .s { font-family: "Courier New", ui-monospace, monospace; font-size: 10px; fill: #5a5a5a; }
    .r { text-anchor: end; }
    .c { text-anchor: middle; }
  </style>

  <rect width="${width}" height="${height}" fill="#4b5563"/>
  <g transform="rotate(${rotate} ${width / 2} ${height / 2})">
    <rect x="10" y="8" width="${width - 20}" height="${height - 16}" fill="#00000022" filter="url(#soft)"/>
    <rect x="8" y="6" width="${width - 20}" height="${height - 16}" fill="url(#paper)"/>

    <text x="${width / 2}" y="42" class="h c">${esc(spec.supplier.toUpperCase())}</text>
    <text x="${width / 2}" y="60" class="s c">${esc(spec.address)}</text>
    <text x="${width / 2}" y="76" class="s c">ABN ${esc(spec.abn)}</text>
    <text x="${width / 2}" y="98" class="b c">TAX INVOICE</text>
    <line x1="26" y1="110" x2="${width - 26}" y2="110" stroke="#9a9a9a" stroke-dasharray="3 3"/>

    <text x="26" y="128" class="m">Date: ${esc(spec.date)}  ${esc(spec.time)}</text>
    <text x="26" y="144" class="m">Docket: ${esc(spec.docket)}</text>
    <line x1="26" y1="154" x2="${width - 26}" y2="154" stroke="#9a9a9a" stroke-dasharray="3 3"/>
    <text x="26" y="168" class="s">ITEM</text>
    <text x="268" y="168" class="s r">QTY</text>
    <text x="330" y="168" class="s r">EACH</text>
    <text x="396" y="168" class="s r">AMT</text>
${lineRows}
    <line x1="26" y1="${footTop}" x2="${width - 26}" y2="${footTop}" stroke="#9a9a9a" stroke-dasharray="3 3"/>
    <text x="268" y="${footTop + 22}" class="m">SUBTOTAL</text>
    <text x="396" y="${footTop + 22}" class="m r">${esc(spec.subtotal)}</text>
    <text x="268" y="${footTop + 40}" class="m">GST 10%</text>
    <text x="396" y="${footTop + 40}" class="m r">${esc(spec.gst)}</text>
    <text x="268" y="${footTop + 64}" class="b">TOTAL</text>
    <text x="396" y="${footTop + 64}" class="b r">${esc(spec.total)}</text>
    <line x1="26" y1="${footTop + 76}" x2="${width - 26}" y2="${footTop + 76}" stroke="#9a9a9a" stroke-dasharray="3 3"/>
    <text x="26" y="${footTop + 94}" class="m">${esc(spec.payment)}</text>
    <text x="${width / 2}" y="${footTop + 120}" class="s c">Thank you — please retain for your records</text>
    ${
      spec.crumpled
        ? `<path d="M40 ${headerBottom - 30} L170 ${headerBottom + 60} L120 ${height - 90}" stroke="#00000012" stroke-width="7" fill="none"/>
    <path d="M${width - 50} 120 L${width - 150} ${height / 2}" stroke="#00000010" stroke-width="5" fill="none"/>
    <circle cx="${width - 80}" cy="${height - 70}" r="26" fill="none" stroke="#b4874733" stroke-width="5"/>`
        : ""
    }
  </g>
</svg>`;
}

export type PhotoSpec = {
  label: string;
  caption: string;
  /** Sets the palette: 'frame' | 'concrete' | 'brick' | 'interior' | 'defect' | 'roof' */
  scene: string;
  stamp?: string;
};

const SCENES: Record<string, { sky: string; ground: string; structure: string; accent: string }> = {
  frame:    { sky: "#b8d4e8", ground: "#9a8b76", structure: "#d9b98a", accent: "#8b6f47" },
  concrete: { sky: "#c4d3de", ground: "#b6b3ad", structure: "#d7d4ce", accent: "#8f8c86" },
  brick:    { sky: "#c9dae8", ground: "#8d8578", structure: "#a4614a", accent: "#7d4736" },
  interior: { sky: "#e8e4dc", ground: "#c3b7a4", structure: "#efece5", accent: "#b9b2a4" },
  defect:   { sky: "#ddd8cf", ground: "#b9b2a4", structure: "#e6e1d8", accent: "#8a5a4a" },
  roof:     { sky: "#9fc6e3", ground: "#7d8a92", structure: "#6f7d87", accent: "#4f5b63" },
};

/** A stand-in site photo. Distinct enough per scene to read as different jobs. */
export function photoSvg(spec: PhotoSpec): string {
  const c = SCENES[spec.scene] ?? SCENES.frame!;
  const studs = Array.from({ length: 9 }, (_, i) => {
    const x = 60 + i * 74;
    return `<rect x="${x}" y="190" width="18" height="290" fill="${c.structure}" opacity="${0.75 + (i % 3) * 0.08}"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600" role="img" aria-label="${esc(spec.caption)}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c.sky}"/>
      <stop offset="100%" stop-color="#f0efe9"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#sky)"/>
  <rect y="470" width="800" height="130" fill="${c.ground}"/>
  ${studs}
  <rect x="42" y="170" width="700" height="20" fill="${c.accent}"/>
  <rect x="42" y="330" width="700" height="14" fill="${c.accent}" opacity="0.8"/>
  <rect x="42" y="452" width="700" height="18" fill="${c.accent}"/>
  ${spec.scene === "defect" ? `<path d="M320 220 L360 330 L330 340 L300 250 Z" fill="#8a3a2a" opacity="0.55"/><circle cx="340" cy="280" r="70" fill="none" stroke="#dc2626" stroke-width="7"/>` : ""}
  ${spec.scene === "roof" ? `<path d="M40 300 L400 120 L760 300 Z" fill="${c.structure}"/>` : ""}
  <rect x="0" y="524" width="800" height="76" fill="#0f172a" opacity="0.72"/>
  <text x="24" y="556" font-family="system-ui, sans-serif" font-size="26" font-weight="700" fill="#ffffff">${esc(spec.label)}</text>
  <text x="24" y="582" font-family="system-ui, sans-serif" font-size="17" fill="#cbd5e1">${esc(spec.caption)}</text>
  ${spec.stamp ? `<text x="776" y="582" text-anchor="end" font-family="ui-monospace, monospace" font-size="16" fill="#fbbf24">${esc(spec.stamp)}</text>` : ""}
</svg>`;
}

/** A one-page stand-in for a plan, permit or signed variation. */
export function documentSvg(title: string, subtitle: string, kind: string): string {
  const rows = Array.from({ length: 16 }, (_, i) => {
    const w = 120 + ((i * 97) % 380);
    return `<rect x="70" y="${250 + i * 26}" width="${w}" height="9" rx="4" fill="#cbd5e1"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595 842" width="595" height="842" role="img" aria-label="${esc(title)}">
  <rect width="595" height="842" fill="#ffffff"/>
  <rect x="0" y="0" width="595" height="8" fill="#ea580c"/>
  <text x="70" y="110" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#ea580c" letter-spacing="2">${esc(kind.toUpperCase())}</text>
  <text x="70" y="152" font-family="system-ui, sans-serif" font-size="27" font-weight="800" fill="#0f172a">${esc(title)}</text>
  <text x="70" y="180" font-family="system-ui, sans-serif" font-size="15" fill="#475569">${esc(subtitle)}</text>
  <line x1="70" y1="210" x2="525" y2="210" stroke="#e2e8f0" stroke-width="2"/>
  ${rows}
  <rect x="70" y="700" width="200" height="1.5" fill="#94a3b8"/>
  <text x="70" y="722" font-family="system-ui, sans-serif" font-size="12" fill="#64748b">Signed</text>
  <rect x="330" y="700" width="195" height="1.5" fill="#94a3b8"/>
  <text x="330" y="722" font-family="system-ui, sans-serif" font-size="12" fill="#64748b">Date</text>
</svg>`;
}
