import { eq } from "drizzle-orm";
import { db } from "../index";
import {
  expenses, expenseLines, invoices, invoiceLines, payments, receiptUploads,
  receiptBatches, purchaseOrders, purchaseOrderLines, purchaseOrderReceipts,
  purchaseOrderReceiptLines, variations, variationLines,
} from "../schema";
import type { Ctx } from "./context";
import { dayOffset, atTime, GST_BP } from "./context";
import { $, storeFile, costLines, sumLines, type LineSpec } from "./helpers";
import { receiptSvg, documentSvg, type ReceiptSpec } from "./images";
import { taxOn, exTaxFromInclusive, roundHalf } from "../../lib/money";

/* ================================= expenses ================================ */

type ExpenseSpec = {
  key?: string;
  job: string | null;
  supplier: string;
  category: string;
  day: number;
  description: string;
  /** Tax-inclusive total in dollars — how it reads on the docket. */
  incTotal: number;
  billable?: boolean;
  method?: "card" | "bank_transfer" | "cash";
  gstFree?: boolean;
  lines?: Array<{ description: string; qty: number; unit: string; each: number }>;
  by?: string;
};

const EXPENSE_SPECS: ExpenseSpec[] = [
  // Kilby extension — the big one, deliberately running hot.
  { job: "kilby_ext", supplier: "Dahlsens Building Centre", category: "Timber & framing", day: -34, description: "Frame pack — ground floor", incTotal: 18_942.5 },
  { job: "kilby_ext", supplier: "Dahlsens Building Centre", category: "Timber & framing", day: -19, description: "Frame pack — first floor and LVL portal", incTotal: 16_388.0 },
  { job: "kilby_ext", supplier: "Boral Concrete Geebung", category: "Concrete & steel", day: -35, description: "N32 concrete — footings and slab, 21m3", incTotal: 7_128.0 },
  { job: "kilby_ext", supplier: "Bunnings Trade Newmarket", category: "Hardware & fixings", day: -30, description: "Bracing, strapping, bolts and fixings", incTotal: 1_284.6,
    lines: [
      { description: "Triplegrip 40x40 (box 100)", qty: 4, unit: "box", each: 62.4 },
      { description: "M12 cup head bolt 200mm", qty: 40, unit: "ea", each: 4.85 },
      { description: "Metal strap brace 30m", qty: 6, unit: "roll", each: 48.9 },
      { description: "Batten screws 14gx75 (box 500)", qty: 3, unit: "box", each: 89.0 },
    ] },
  { job: "kilby_ext", supplier: "Kennards Hire Newmarket", category: "Plant & equipment hire", day: -28, description: "Scaffold hire — 4 weeks", incTotal: 1_496.0 },
  { job: "kilby_ext", supplier: "Handy Skips Brisbane", category: "Skip bins & waste", day: -33, description: "6m3 skip — demolition waste", incTotal: 473.0 },
  { job: "kilby_ext", supplier: "Handy Skips Brisbane", category: "Skip bins & waste", day: -12, description: "6m3 skip — framing offcuts", incTotal: 473.0 },
  { job: "kilby_ext", supplier: "Northside Plumbing Co", category: "Subcontractor", day: -16, description: "Plumbing rough in — 6 days", incTotal: 6_072.0, method: "bank_transfer" },
  { job: "kilby_ext", supplier: "Kelly Electrical", category: "Subcontractor", day: -14, description: "Electrical rough in and temporary supply", incTotal: 4_840.0, method: "bank_transfer" },
  { job: "kilby_ext", supplier: "Bunnings Trade Newmarket", category: "Hardware & fixings", day: -6, description: "Roof battens, sealant and consumables", incTotal: 892.35 },
  { job: "kilby_ext", supplier: "Bunnings Trade Newmarket", category: "Tools & consumables", day: -20, description: "Circular saw blades and PPE", incTotal: 316.8, billable: false },

  // Coorparoo Unit 3 bathroom
  { job: "cpg_u3", supplier: "Reece Plumbing Newmarket", category: "Plumbing supplies", day: -7, description: "Bathroom rough in materials", incTotal: 1_842.9 },
  { job: "cpg_u3", supplier: "Beaumont Tiles Windsor", category: "Tiles & waterproofing", day: -5, description: "Floor and wall tiles, adhesive, grout", incTotal: 2_364.0 },
  { job: "cpg_u3", supplier: "Bunnings Trade Newmarket", category: "Tiles & waterproofing", day: -6, description: "Waterproofing membrane kit and primer", incTotal: 428.9 },
  { job: "cpg_u3", supplier: "Handy Skips Brisbane", category: "Skip bins & waste", day: -8, description: "3m3 skip — bathroom strip out", incTotal: 341.0 },
  { job: "cpg_u3", supplier: "Northside Plumbing Co", category: "Subcontractor", day: -4, description: "Rough in plus emergency waste replacement", incTotal: 3_146.0, method: "bank_transfer" },

  // Finished jobs, so their profit reports have substance.
  { job: "whitfield_kitchen", supplier: "Dahlsens Building Centre", category: "Timber & framing", day: -90, description: "Kitchen carcass materials and trim", incTotal: 9_845.2 },
  { job: "whitfield_kitchen", supplier: "Reece Plumbing Newmarket", category: "Plumbing supplies", day: -84, description: "Sink, mixer, laundry tub and connections", incTotal: 2_398.0 },
  { job: "whitfield_kitchen", supplier: "Kelly Electrical", category: "Subcontractor", day: -78, description: "Kitchen and laundry electrical", incTotal: 3_520.0, method: "bank_transfer" },
  { job: "whitfield_kitchen", supplier: "Beaumont Tiles Windsor", category: "Tiles & waterproofing", day: -80, description: "Splashback and laundry floor tiles", incTotal: 1_684.0 },
  { job: "whitfield_kitchen", supplier: "Bunnings Trade Newmarket", category: "Hardware & fixings", day: -76, description: "Hardware, handles and sundries", incTotal: 742.6 },
  { job: "raman_deck", supplier: "Dahlsens Building Centre", category: "Timber & framing", day: -42, description: "Merbau decking, bearers and joists", incTotal: 11_287.4 },
  { job: "raman_deck", supplier: "Bunnings Trade Newmarket", category: "Hardware & fixings", day: -38, description: "Decking screws, stirrups, oil", incTotal: 1_186.9 },
  { job: "raman_deck", supplier: "Boral Concrete Geebung", category: "Concrete & steel", day: -43, description: "Footing concrete, 2.4m3", incTotal: 858.0 },
  { job: "raman_deck", supplier: "Kelly Electrical", category: "Subcontractor", day: -24, description: "Deck lighting and outdoor GPO", incTotal: 1_320.0, method: "bank_transfer" },
  { job: "kilby_carport", supplier: "Boral Concrete Geebung", category: "Concrete & steel", day: -137, description: "N25 concrete 5.2m3 and mesh", incTotal: 2_194.0 },
  { job: "kilby_carport", supplier: "Kennards Hire Newmarket", category: "Plant & equipment hire", day: -138, description: "Plate compactor and concrete saw", incTotal: 462.0 },
  { job: "whitfield_ensuite", supplier: "Beaumont Tiles Windsor", category: "Tiles & waterproofing", day: -4, description: "Replacement tiles and grout", incTotal: 187.2 },

  // Second half of the finished jobs, so their profit figures are complete.
  { job: "whitfield_kitchen", supplier: "Dahlsens Building Centre", category: "Timber & framing", day: -70, description: "Stone benchtop supply and install", incTotal: 8_690.0 },
  { job: "whitfield_kitchen", supplier: "Bunnings Trade Newmarket", category: "Paint & finishes", day: -66, description: "Paint, primer and finishing materials", incTotal: 986.4 },
  { job: "whitfield_kitchen", supplier: "Tilecraft QLD", category: "Subcontractor", day: -74, description: "Splashback and laundry tiling", incTotal: 2_640.0, method: "bank_transfer" },
  { job: "whitfield_kitchen", supplier: "Northside Plumbing Co", category: "Subcontractor", day: -72, description: "Kitchen and laundry plumbing fit off", incTotal: 3_036.0, method: "bank_transfer" },
  { job: "whitfield_kitchen", supplier: "Handy Skips Brisbane", category: "Skip bins & waste", day: -92, description: "Skip bin — kitchen strip out", incTotal: 473.0 },
  { job: "whitfield_kitchen", supplier: "Kennards Hire Newmarket", category: "Plant & equipment hire", day: -88, description: "Wet saw and dust extractor", incTotal: 286.0 },

  // Raman deck — this one got away from us. Merbau went up mid-job and we
  // lost two days to the wet. It is the job the dashboard flags as over.
  { job: "raman_deck", supplier: "Dahlsens Building Centre", category: "Timber & framing", day: -30, description: "Additional merbau — price rise on reorder", incTotal: 4_862.0 },
  { job: "raman_deck", supplier: "Dahlsens Building Centre", category: "Timber & framing", day: -34, description: "Pergola frame, colorbond sheeting and flashings", incTotal: 6_941.0 },
  { job: "raman_deck", supplier: "Bunnings Trade Newmarket", category: "Hardware & fixings", day: -26, description: "Handrail balustrade, stirrups and sundries", incTotal: 2_244.0 },
  { job: "raman_deck", supplier: "Kennards Hire Newmarket", category: "Plant & equipment hire", day: -40, description: "Post hole borer and props, 2 weeks", incTotal: 891.0 },
  { job: "raman_deck", supplier: "Handy Skips Brisbane", category: "Skip bins & waste", day: -20, description: "Skip bin — offcuts and packaging", incTotal: 473.0 },
  { job: "raman_deck", supplier: "Bunnings Trade Newmarket", category: "Paint & finishes", day: -18, description: "Decking oil and applicators", incTotal: 528.0 },
  { job: "kilby_carport", supplier: "Bunnings Trade Newmarket", category: "Hardware & fixings", day: -136, description: "Formwork timber, mesh chairs, expansion joint", incTotal: 638.0 },
  { job: "kilby_carport", supplier: "Boral Concrete Geebung", category: "Concrete & steel", day: -134, description: "Additional N25 for the spoon drain, 1.8m3", incTotal: 781.0 },
  { job: "kilby_carport", supplier: "Handy Skips Brisbane", category: "Skip bins & waste", day: -139, description: "Skip bin — excavated spoil", incTotal: 429.0 },
  { job: "kilby_carport", supplier: "Kennards Hire Newmarket", category: "Plant & equipment hire", day: -140, description: "1.7t excavator and tipper, 2 days", incTotal: 1_408.0 },
  { job: "kilby_carport", supplier: "Tilecraft QLD", category: "Subcontractor", day: -133, description: "Concrete cutting and pump hire", incTotal: 990.0, method: "bank_transfer" },

  // Overheads with no job — these show up in the tax summary, not job profit.
  { job: null, supplier: "Ampol Newmarket", category: "Fuel & vehicle", day: -2, description: "Diesel — ute", incTotal: 142.6, billable: false },
  { job: null, supplier: "Ampol Newmarket", category: "Fuel & vehicle", day: -16, description: "Diesel — ute and trailer", incTotal: 168.4, billable: false },
  { job: null, supplier: "Ampol Newmarket", category: "Fuel & vehicle", day: -31, description: "Diesel — ute", incTotal: 151.2, billable: false },
  { job: null, supplier: "Bunnings Trade Newmarket", category: "Tools & consumables", day: -23, description: "Impact driver replacement", incTotal: 449.0, billable: false },
];

export async function seedMoney(ctx: Ctx) {
  await seedExpenses(ctx);
  await seedReceiptQueue(ctx);
  await seedInvoices(ctx);
  await seedPurchaseOrders(ctx);
  await seedVariations(ctx);
}

async function seedExpenses(ctx: Ctx) {
  for (const spec of EXPENSE_SPECS) {
    const totalCents = $(spec.incTotal);
    const rate = spec.gstFree ? 0 : GST_BP;
    const subtotalCents = exTaxFromInclusive(totalCents, rate);
    const taxCents = totalCents - subtotalCents;

    const [row] = await db
      .insert(expenses)
      .values({
        jobId: spec.job ? ctx.jobs[spec.job]! : null,
        supplierId: ctx.suppliers[spec.supplier]!,
        categoryId: ctx.categories[spec.category]!,
        expenseDate: dayOffset(spec.day),
        description: spec.description,
        supplierNameRaw: spec.supplier,
        subtotalCents,
        taxCents,
        totalCents,
        isBillable: spec.billable ?? true,
        paymentMethod: spec.method ?? "card",
        source: "manual",
        createdBy: ctx.users[spec.by ?? "greg"]!,
      })
      .returning({ id: expenses.id });

    if (spec.lines?.length) {
      await db.insert(expenseLines).values(
        spec.lines.map((line, i) => ({
          expenseId: row!.id,
          sortOrder: i,
          description: line.description,
          quantity: String(line.qty),
          unit: line.unit,
          unitPriceCents: $(line.each),
          lineTotalCents: roundHalf(line.qty * $(line.each)),
        })),
      );
    }
  }
}

/* ============================== receipt queue ============================== */

type QueuedReceipt = {
  spec: ReceiptSpec;
  status: "needs_review" | "approved" | "failed" | "processing";
  supplier: string | null;
  job: string | null;
  category: string | null;
  confidence: number;
  fieldConfidence: Record<string, number>;
  reason: string;
  note?: string;
  by: string;
};

const QUEUE: QueuedReceipt[] = [
  {
    spec: {
      supplier: "Bunnings Trade", abn: "26 008 672 179",
      address: "114 Enoggera Rd, Newmarket QLD 4051",
      date: dayOffset(-1).split("-").reverse().join("/"), time: "06:52",
      docket: "4051-118-99274",
      lines: [
        { description: "TIMBER PINE MGP10 90X45", qty: "24", each: "8.14", total: "195.36" },
        { description: "SCREW BATTEN 14GX75 500PK", qty: "2", each: "89.00", total: "178.00" },
        { description: "SIKAFLEX 11FC GREY 300ML", qty: "6", each: "14.95", total: "89.70" },
        { description: "BLADE CIRC SAW 185MM 40T", qty: "2", each: "38.50", total: "77.00" },
      ],
      subtotal: "490.96", gst: "49.10", total: "540.06", payment: "EFTPOS VISA ****4412",
    },
    status: "needs_review", supplier: "Bunnings Trade Newmarket", job: "kilby_ext",
    category: "Timber & framing", confidence: 94,
    fieldConfidence: { supplier: 98, date: 96, subtotal: 97, tax: 97, total: 98, category: 82, job: 71 },
    reason: "Supplier matched on ABN. Job suggested from the crew's location at 06:52 and the timber on the docket matching the Ashgrove framing.",
    by: "jake",
  },
  {
    spec: {
      supplier: "Reece", abn: "84 004 097 090",
      address: "80 Enoggera Rd, Newmarket QLD 4051",
      date: dayOffset(-1).split("-").reverse().join("/"), time: "13:20",
      docket: "R99341-220184",
      lines: [
        { description: "MIXER BASIN CHROME WELS4", qty: "1", each: "184.00", total: "184.00" },
        { description: "WASTE 40MM CHROME", qty: "2", each: "28.50", total: "57.00" },
        { description: "PVC DWV 100MM X 3M", qty: "3", each: "42.80", total: "128.40" },
        { description: "SOLVENT CEMENT PRIMER 500ML", qty: "1", each: "36.90", total: "36.90" },
      ],
      subtotal: "406.30", gst: "40.63", total: "446.93", payment: "ACCOUNT R-99341",
    },
    status: "needs_review", supplier: "Reece Plumbing Newmarket", job: "cpg_u3",
    category: "Plumbing supplies", confidence: 91,
    fieldConfidence: { supplier: 97, date: 94, subtotal: 95, tax: 95, total: 96, category: 93, job: 68 },
    reason: "Account number R-99341 matches Reece Newmarket. Job suggested because Unit 3 is the only open bathroom.",
    by: "marco",
  },
  {
    spec: {
      supplier: "Beaumont Tiles", abn: "38 007 890 234",
      address: "240 Lutwyche Rd, Windsor QLD 4030",
      date: dayOffset(-2).split("-").reverse().join("/"), time: "10:14",
      docket: "BT-WIN-55219",
      lines: [
        { description: "TILE MATT WHT 600X600", qty: "18", each: "52.00", total: "936.00" },
        { description: "ADHESIVE FLEX 20KG", qty: "5", each: "48.60", total: "243.00" },
        { description: "GROUT CHARCOAL 5KG", qty: "3", each: "34.20", total: "102.60" },
      ],
      subtotal: "1281.60", gst: "128.16", total: "1409.76", payment: "EFTPOS VISA ****4412",
      crumpled: true,
    },
    status: "needs_review", supplier: "Beaumont Tiles Windsor", job: null,
    category: "Tiles & waterproofing", confidence: 58,
    fieldConfidence: { supplier: 88, date: 51, subtotal: 92, tax: 92, total: 94, category: 89, job: 34 },
    reason: "Date is smudged on the docket — please confirm it. Two jobs are tiling this fortnight so the job couldn't be picked automatically.",
    note: "Docket was folded in half — the model read the date as either the 13th or the 18th.",
    by: "marco",
  },
  {
    spec: {
      supplier: "Ampol Foodary", abn: "17 000 032 128",
      address: "96 Enoggera Rd, Newmarket QLD 4051",
      date: dayOffset(-2).split("-").reverse().join("/"), time: "06:31",
      docket: "0042-118773",
      lines: [{ description: "DIESEL 62.41L @ 2.089", qty: "62.41", each: "2.089", total: "130.38" }],
      subtotal: "118.53", gst: "11.85", total: "130.38", payment: "FUEL CARD ****8821",
    },
    status: "needs_review", supplier: "Ampol Newmarket", job: null,
    category: "Fuel & vehicle", confidence: 96,
    fieldConfidence: { supplier: 99, date: 98, subtotal: 96, tax: 96, total: 99, category: 97, job: 95 },
    reason: "Fuel is an overhead, so no job has been suggested. Marked not billable.",
    by: "greg",
  },
  {
    spec: {
      supplier: "Kennards Hire", abn: "60 000 013 300",
      address: "168 Enoggera Rd, Newmarket QLD 4051",
      date: dayOffset(-3).split("-").reverse().join("/"), time: "16:47",
      docket: "KH-NM-771294",
      lines: [
        { description: "SCAFFOLD MOBILE 4M WK HIRE", qty: "2", each: "340.00", total: "680.00" },
        { description: "DAMAGE WAIVER", qty: "1", each: "68.00", total: "68.00" },
      ],
      subtotal: "748.00", gst: "74.80", total: "822.80", payment: "ACCOUNT",
    },
    status: "needs_review", supplier: "Kennards Hire Newmarket", job: "kilby_ext",
    category: "Plant & equipment hire", confidence: 89,
    fieldConfidence: { supplier: 96, date: 93, subtotal: 91, tax: 91, total: 95, category: 94, job: 79 },
    reason: "Scaffold is only on the Ashgrove job at the moment.",
    by: "jake",
  },
  {
    spec: {
      supplier: "Unreadable", abn: "—", address: "—", date: "—", time: "—", docket: "—",
      lines: [{ description: "—", qty: "—", each: "—", total: "—" }],
      subtotal: "—", gst: "—", total: "—", payment: "—", crumpled: true,
    },
    status: "failed", supplier: null, job: null, category: null, confidence: 0,
    fieldConfidence: {},
    reason: "",
    note: "Photo was too blurry to read anything. Take it again in better light, flat on the tailgate.",
    by: "tyler",
  },
  {
    spec: {
      supplier: "Handy Skips", abn: "51 622 009 118", address: "Brisbane QLD",
      date: dayOffset(-4).split("-").reverse().join("/"), time: "11:02",
      docket: "HS-40921",
      lines: [{ description: "SKIP BIN 3M3 MIXED WASTE", qty: "1", each: "310.00", total: "310.00" }],
      subtotal: "310.00", gst: "31.00", total: "341.00", payment: "EFTPOS VISA ****4412",
    },
    status: "approved", supplier: "Handy Skips Brisbane", job: "cpg_u3",
    category: "Skip bins & waste", confidence: 97,
    fieldConfidence: { supplier: 99, date: 98, subtotal: 98, tax: 98, total: 99, category: 96, job: 88 },
    reason: "All fields read cleanly and the arithmetic checks out.",
    by: "marco",
  },
];

async function seedReceiptQueue(ctx: Ctx) {
  const [batch] = await db
    .insert(receiptBatches)
    .values({ label: "Ute clean-out — Friday arvo", createdBy: ctx.users.greg })
    .returning({ id: receiptBatches.id });

  for (const item of QUEUE) {
    const uploader = ctx.users[item.by]!;
    const fileId = await storeFile({
      prefix: "receipts",
      filename: `receipt-${item.spec.docket.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.svg`,
      body: receiptSvg(item.spec),
      mimeType: "image/svg+xml",
      uploadedBy: uploader,
      width: 420,
      height: 600,
    });

    const failed = item.status === "failed";
    const totalCents = failed ? 0 : $(Number(item.spec.total));
    const subtotalCents = failed ? 0 : $(Number(item.spec.subtotal));
    const taxCents = failed ? 0 : $(Number(item.spec.gst));

    const extraction = failed
      ? null
      : {
          supplierName: { value: item.spec.supplier, confidence: item.fieldConfidence.supplier ?? 0 },
          abn: { value: item.spec.abn, confidence: 90 },
          date: { value: isoFromAu(item.spec.date), confidence: item.fieldConfidence.date ?? 0 },
          documentNumber: { value: item.spec.docket, confidence: 92 },
          subtotalCents: { value: subtotalCents, confidence: item.fieldConfidence.subtotal ?? 0 },
          taxCents: { value: taxCents, confidence: item.fieldConfidence.tax ?? 0 },
          totalCents: { value: totalCents, confidence: item.fieldConfidence.total ?? 0 },
          paymentMethod: { value: item.spec.payment, confidence: 85 },
          lineItems: item.spec.lines.map((l) => ({
            description: l.description,
            quantity: l.qty,
            unitPriceCents: $(Number(l.each) || 0),
            lineTotalCents: $(Number(l.total) || 0),
            confidence: 88,
          })),
          notes: item.note ?? null,
        };

    // The approved one already became an expense.
    let expenseId: string | null = null;
    if (item.status === "approved") {
      const [exp] = await db
        .insert(expenses)
        .values({
          jobId: item.job ? ctx.jobs[item.job]! : null,
          supplierId: item.supplier ? ctx.suppliers[item.supplier]! : null,
          categoryId: item.category ? ctx.categories[item.category]! : null,
          expenseDate: isoFromAu(item.spec.date),
          description: `${item.spec.supplier} — ${item.spec.lines[0]?.description ?? "Receipt"}`,
          supplierNameRaw: item.spec.supplier,
          subtotalCents,
          taxCents,
          totalCents,
          isBillable: true,
          paymentMethod: "card",
          source: "receipt",
          receiptFileId: fileId,
          createdBy: uploader,
        })
        .returning({ id: expenses.id });
      expenseId = exp!.id;

      await db.insert(expenseLines).values(
        item.spec.lines.map((l, i) => ({
          expenseId: exp!.id,
          sortOrder: i,
          description: l.description,
          quantity: String(Number(l.qty) || 1),
          unit: "ea",
          unitPriceCents: $(Number(l.each) || 0),
          lineTotalCents: $(Number(l.total) || 0),
          extractionConfidence: 88,
        })),
      );
    }

    await db.insert(receiptUploads).values({
      batchId: batch!.id,
      fileId,
      status: item.status,
      ocrProvider: "none",
      ocrText: failed ? null : buildOcrText(item.spec),
      extractionProvider: "mock",
      extractionModel: "seed-fixture",
      extractionMs: 1200 + Math.round(Math.random() * 900),
      attempts: failed ? 2 : 1,
      errorMessage: failed ? "Couldn't make out any text. Try again in better light." : null,
      extraction,
      overallConfidence: item.confidence,
      arithmeticOk: failed ? false : subtotalCents + taxCents === totalCents,
      suggestedSupplierId: item.supplier ? ctx.suppliers[item.supplier]! : null,
      suggestedJobId: item.job ? ctx.jobs[item.job]! : null,
      suggestedCategoryId: item.category ? ctx.categories[item.category]! : null,
      suggestionReason: item.reason || null,
      expenseId,
      reviewedBy: item.status === "approved" ? ctx.users.donna : null,
      reviewedAt: item.status === "approved" ? atTime(-3, 18, 20) : null,
      uploadedBy: uploader,
    });
  }
}

function isoFromAu(date: string): string {
  const [d, m, y] = date.split("/");
  if (!d || !m || !y) return dayOffset(-1);
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function buildOcrText(spec: ReceiptSpec): string {
  return [
    spec.supplier.toUpperCase(),
    spec.address,
    `ABN ${spec.abn}`,
    "TAX INVOICE",
    `${spec.date} ${spec.time}`,
    `DOCKET ${spec.docket}`,
    ...spec.lines.map((l) => `${l.description}  ${l.qty}  ${l.each}  ${l.total}`),
    `SUBTOTAL ${spec.subtotal}`,
    `GST ${spec.gst}`,
    `TOTAL ${spec.total}`,
    spec.payment,
  ].join("\n");
}

/* ================================= invoices ================================ */

type InvoiceSpec = {
  key: string;
  number: string;
  job: string | null;
  client: string;
  type: "standard" | "deposit" | "progress" | "final";
  status: "draft" | "sent" | "part_paid" | "paid" | "overdue";
  issued: number;
  terms: number;
  lines: Array<{ description: string; qty: number; unit: string; each: number; source?: string }>;
  paid?: Array<{ day: number; amount: number; method?: "bank_transfer" | "card" | "cash" }>;
  progressBp?: number;
  previouslyClaimed?: number;
  notes?: string;
};

const INVOICE_SPECS: InvoiceSpec[] = [
  { key: "whit_dep", number: "INV-2041", job: "whitfield_kitchen", client: "whitfield", type: "deposit",
    status: "paid", issued: -98, terms: 7,
    lines: [{ description: "Deposit — kitchen & laundry renovation (10%)", qty: 1, unit: "ea", each: 6_840, source: "deposit" }],
    paid: [{ day: -96, amount: 7_524 }] },
  { key: "whit_prog", number: "INV-2052", job: "whitfield_kitchen", client: "whitfield", type: "progress",
    status: "paid", issued: -78, terms: 14, progressBp: 5000, previouslyClaimed: 6_840,
    lines: [{ description: "Progress claim 1 — carcasses installed, benchtops templated", qty: 1, unit: "ea", each: 27_360, source: "progress" }],
    paid: [{ day: -70, amount: 30_096 }] },
  { key: "whit_final", number: "INV-2061", job: "whitfield_kitchen", client: "whitfield", type: "final",
    status: "paid", issued: -58, terms: 14, previouslyClaimed: 34_200,
    lines: [{ description: "Final claim — kitchen & laundry renovation complete", qty: 1, unit: "ea", each: 34_200, source: "progress" }],
    paid: [{ day: -50, amount: 37_620 }] },
  { key: "carport", number: "INV-2018", job: "kilby_carport", client: "kilby", type: "standard",
    status: "paid", issued: -130, terms: 14,
    lines: [{ description: "Carport slab 34m2 and spoon drain to street", qty: 1, unit: "ea", each: 14_600 }],
    paid: [{ day: -124, amount: 16_060 }] },
  { key: "deck_dep", number: "INV-2035", job: "raman_deck", client: "raman", type: "deposit",
    status: "paid", issued: -46, terms: 7,
    lines: [{ description: "Deposit — rear deck & pergola (15%)", qty: 1, unit: "ea", each: 7_185, source: "deposit" }],
    paid: [{ day: -45, amount: 7_903.5 }] },
  { key: "deck_final", number: "INV-2065", job: "raman_deck", client: "raman", type: "final",
    status: "overdue", issued: -38, terms: 14, previouslyClaimed: 7_185,
    lines: [
      { description: "Rear deck 42m2 — merbau, steel posts to footings", qty: 1, unit: "ea", each: 31_200 },
      { description: "Colorbond pergola over 21m2", qty: 1, unit: "ea", each: 9_515 },
    ],
    notes: "Deposit of $7,185 already received. Balance now due." },
  { key: "cpg_prog", number: "INV-2068", job: "cpg_u3", client: "cpg", type: "progress",
    status: "sent", issued: -6, terms: 30, progressBp: 5000,
    lines: [{ description: "Progress claim 1 — strip out, rough in and waterproofing complete (50%)", qty: 1, unit: "ea", each: 12_400, source: "progress" }] },
  { key: "kilby_prog3", number: "INV-2063", job: "kilby_ext", client: "kilby", type: "progress",
    status: "paid", issued: -30, terms: 14, progressBp: 3500, previouslyClaimed: 63_700,
    lines: [{ description: "Progress claim 3 — slab, footings and ground floor frame", qty: 1, unit: "ea", each: 47_775, source: "progress" }],
    paid: [{ day: -22, amount: 52_552.5 }] },
  { key: "kilby_prog4", number: "INV-2069", job: "kilby_ext", client: "kilby", type: "progress",
    status: "part_paid", issued: -9, terms: 14, progressBp: 5500, previouslyClaimed: 111_475,
    lines: [{ description: "Progress claim 4 — first floor frame and roof structure", qty: 1, unit: "ea", each: 63_700, source: "progress" }],
    paid: [{ day: -3, amount: 40_000 }] },
  { key: "ensuite", number: "INV-2070", job: "whitfield_ensuite", client: "whitfield", type: "standard",
    status: "sent", issued: -3, terms: 14,
    lines: [
      { description: "Replace 4 cracked floor tiles in ensuite", qty: 1, unit: "ea", each: 820 },
      { description: "Re-grout shower junction and reseal", qty: 1, unit: "ea", each: 360 },
    ] },
  { key: "dental_dep", number: "INV-2067", job: "dental_fitout", client: "dental", type: "deposit",
    status: "paid", issued: -13, terms: 7,
    lines: [{ description: "Deposit — reception fitout (20%, covers joinery order)", qty: 1, unit: "ea", each: 8_240, source: "deposit" }],
    paid: [{ day: -11, amount: 9_064 }] },
  { key: "cpg_draft", number: "INV-2072", job: "cpg_u3", client: "cpg", type: "progress",
    status: "draft", issued: 0, terms: 30, progressBp: 10000, previouslyClaimed: 12_400,
    lines: [{ description: "Final claim — Unit 3 bathroom refit complete", qty: 1, unit: "ea", each: 12_400, source: "progress" }],
    notes: "Don't send until Angela signs off the handover." },
];

async function seedInvoices(ctx: Ctx) {
  for (const spec of INVOICE_SPECS) {
    const lines = spec.lines.map((l) => {
      const subtotal = roundHalf(l.qty * $(l.each));
      const tax = taxOn(subtotal, GST_BP);
      return { ...l, subtotal, tax, total: subtotal + tax };
    });

    const subtotalCents = lines.reduce((a, l) => a + l.subtotal, 0);
    const taxCents = lines.reduce((a, l) => a + l.tax, 0);
    const totalCents = subtotalCents + taxCents;
    const amountPaidCents = (spec.paid ?? []).reduce((a, p) => a + $(p.amount), 0);

    const [inv] = await db
      .insert(invoices)
      .values({
        invoiceNumber: spec.number,
        clientId: ctx.clients[spec.client]!,
        jobId: spec.job ? ctx.jobs[spec.job]! : null,
        type: spec.type,
        status: spec.status,
        issueDate: dayOffset(spec.issued),
        dueDate: dayOffset(spec.issued + spec.terms),
        paymentTermsDays: spec.terms,
        progressPercentBp: spec.progressBp ?? null,
        previouslyClaimedCents: $(spec.previouslyClaimed ?? 0),
        subtotalCents,
        taxCents,
        totalCents,
        amountPaidCents,
        balanceCents: totalCents - amountPaidCents,
        notes: spec.notes ?? null,
        sentAt: spec.status === "draft" ? null : atTime(spec.issued, 17, 5),
        paidAt: spec.status === "paid" ? atTime(spec.paid!.at(-1)!.day, 9, 0) : null,
        createdBy: ctx.users.donna,
      })
      .returning({ id: invoices.id });

    ctx.invoices[spec.key] = inv!.id;

    await db.insert(invoiceLines).values(
      lines.map((l, i) => ({
        invoiceId: inv!.id,
        sortOrder: i,
        sourceType: l.source ?? "manual",
        description: l.description,
        quantity: String(l.qty),
        unit: l.unit,
        unitPriceCents: $(l.each),
        lineSubtotalCents: l.subtotal,
        taxRateId: ctx.gstRateId,
        lineTaxCents: l.tax,
        lineTotalCents: l.total,
      })),
    );

    if (spec.paid?.length) {
      await db.insert(payments).values(
        spec.paid.map((p) => ({
          invoiceId: inv!.id,
          amountCents: $(p.amount),
          paidOn: dayOffset(p.day),
          method: p.method ?? "bank_transfer",
          reference: spec.number,
          recordedBy: ctx.users.donna,
        })),
      );
    }
  }
}

/* ============================= purchase orders ============================= */

async function seedPurchaseOrders(ctx: Ctx) {
  const specs = [
    {
      number: "PO-0314", supplier: "Dahlsens Building Centre", job: "kilby_ext",
      status: "received" as const, ordered: -24, expected: -19,
      lines: [
        { description: "LVL 240x45 portal beam 6.0m", qty: 2, unit: "ea", cost: 486 },
        { description: "MGP10 90x45 x 4.8m", qty: 140, unit: "ea", cost: 35.5 },
        { description: "Structural ply 17mm", qty: 28, unit: "sheet", cost: 92 },
        { description: "Roof trusses — supply", qty: 1, unit: "lot", cost: 6_840 },
      ],
      received: { day: -19, docket: "DAH-448102", note: "All arrived, two sheets of ply damaged — credited." },
    },
    {
      number: "PO-0316", supplier: "Middys Electrical Newstead", job: "dental_fitout",
      status: "sent" as const, ordered: -4, expected: 16,
      lines: [
        { description: "LED panel 600x600 40W 4000K", qty: 12, unit: "ea", cost: 88 },
        { description: "Ceiling grid 24mm white", qty: 64, unit: "m", cost: 9.4 },
        { description: "Emergency exit light", qty: 2, unit: "ea", cost: 142 },
      ],
    },
    {
      number: "PO-0317", supplier: "Beaumont Tiles Windsor", job: "cpg_u3",
      status: "part_received" as const, ordered: -9, expected: -5,
      lines: [
        { description: "Floor tile 600x600 matt white", qty: 18, unit: "m2", cost: 52 },
        { description: "Wall tile 300x600 gloss white", qty: 26, unit: "m2", cost: 41 },
        { description: "Tile trim chrome 2.5m", qty: 8, unit: "ea", cost: 28 },
      ],
      received: { day: -5, docket: "BT-88214", note: "Wall tiles short by 6m2 — back ordered to Thursday." },
      partial: true,
    },
  ];

  for (const spec of specs) {
    const lines = spec.lines.map((l) => {
      const sub = roundHalf(l.qty * $(l.cost));
      const tax = taxOn(sub, GST_BP);
      return { ...l, sub, tax, total: sub + tax };
    });
    const subtotalCents = lines.reduce((a, l) => a + l.sub, 0);
    const taxCents = lines.reduce((a, l) => a + l.tax, 0);

    const [po] = await db
      .insert(purchaseOrders)
      .values({
        poNumber: spec.number,
        supplierId: ctx.suppliers[spec.supplier]!,
        jobId: ctx.jobs[spec.job]!,
        status: spec.status,
        orderDate: dayOffset(spec.ordered),
        expectedDate: dayOffset(spec.expected),
        deliverTo: "Site — see job address",
        subtotalCents,
        taxCents,
        totalCents: subtotalCents + taxCents,
        sentAt: atTime(spec.ordered, 15, 40),
        createdBy: ctx.users.greg,
      })
      .returning({ id: purchaseOrders.id });

    const lineRows = await db
      .insert(purchaseOrderLines)
      .values(
        lines.map((l, i) => ({
          purchaseOrderId: po!.id,
          sortOrder: i,
          description: l.description,
          quantity: String(l.qty),
          unit: l.unit,
          unitCostCents: $(l.cost),
          taxRateId: ctx.gstRateId,
          lineSubtotalCents: l.sub,
          lineTaxCents: l.tax,
          lineTotalCents: l.total,
          quantityReceived: spec.status === "received" ? String(l.qty) : "0",
        })),
      )
      .returning({ id: purchaseOrderLines.id, quantity: purchaseOrderLines.quantity });

    if (spec.received) {
      const docFileId = await storeFile({
        prefix: "dockets",
        filename: `docket-${spec.received.docket}.svg`,
        body: documentSvg(`Delivery docket ${spec.received.docket}`, `${spec.supplier} — ${spec.number}`, "Delivery docket"),
        mimeType: "image/svg+xml",
        uploadedBy: ctx.users.jake,
      });

      const [receipt] = await db
        .insert(purchaseOrderReceipts)
        .values({
          purchaseOrderId: po!.id,
          receivedOn: dayOffset(spec.received.day),
          docketNumber: spec.received.docket,
          fileId: docFileId,
          notes: spec.received.note,
          receivedBy: ctx.users.jake,
        })
        .returning({ id: purchaseOrderReceipts.id });

      await db.insert(purchaseOrderReceiptLines).values(
        lineRows.map((l, i) => ({
          receiptId: receipt!.id,
          purchaseOrderLineId: l.id,
          quantity: spec.partial && i === 1 ? "20" : l.quantity,
        })),
      );

      if (spec.partial) {
        await db
          .update(purchaseOrderLines)
          .set({ quantityReceived: "20" })
          .where(eq(purchaseOrderLines.id, lineRows[1]!.id));
        await db
          .update(purchaseOrderLines)
          .set({ quantityReceived: lineRows[0]!.quantity })
          .where(eq(purchaseOrderLines.id, lineRows[0]!.id));
      }
    }
  }
}

/* ================================ variations =============================== */

async function seedVariations(ctx: Ctx) {
  const specs: Array<{
    number: string; job: string; title: string; description: string; reason: string;
    status: "draft" | "submitted" | "approved" | "invoiced"; raised: number;
    markupBp: number; days: number; approved?: { at: number; by: string };
    lines: LineSpec[];
  }> = [
    {
      number: "VO-038", job: "kilby_ext",
      title: "Rectify termite damage to existing rear wall plate",
      description:
        "Once the rear cladding came off we found old termite damage through about 4.2m of the bottom plate and two studs. It has to be cut out and replaced before the new portal can bear on it. Photos on the job.",
      reason: "site_condition", status: "approved", raised: -31, markupBp: 1800, days: 2,
      approved: { at: -29, by: "Megan Kilby" },
      lines: [
        { kind: "labour", description: "Cut out damaged plate and studs, splice in new", qty: 22, unit: "hr", unitCost: 62, markupBp: 5500 },
        { kind: "material", description: "H3 treated plate and stud material", qty: 1, unit: "lot", unitCost: 480 },
        { kind: "subcontractor", description: "Pest inspection and treatment certificate", qty: 1, unit: "ea", unitCost: 680 },
      ],
    },
    {
      number: "VO-039", job: "kilby_ext",
      title: "Upgrade first floor bathroom window to obscure glazing",
      description: "Megan asked to swap the standard clear unit for obscure glazing after seeing the neighbour's outlook.",
      reason: "client_request", status: "invoiced", raised: -22, markupBp: 2000, days: 0,
      approved: { at: -21, by: "Megan Kilby" },
      lines: [{ kind: "material", description: "Obscure glazed awning window 1200x900 — supply difference", qty: 1, unit: "ea", unitCost: 410 }],
    },
    {
      number: "VO-040", job: "cpg_u3",
      title: "Replace corroded cast iron waste stack",
      description:
        "The cast iron waste behind the vanity was rusted right through — it would have leaked into the unit below within a year. Replaced with PVC back to the junction. Not something we could have seen before strip out.",
      reason: "site_condition", status: "approved", raised: -5, markupBp: 1800, days: 1,
      approved: { at: -4, by: "Angela Pertile" },
      lines: [
        { kind: "subcontractor", description: "Plumber — cut out and replace waste stack", qty: 1, unit: "day", unitCost: 920 },
        { kind: "material", description: "PVC DWV, fittings and access panel", qty: 1, unit: "lot", unitCost: 290 },
        { kind: "labour", description: "Open up and make good wall", qty: 6, unit: "hr", unitCost: 62, markupBp: 5500 },
      ],
    },
    {
      number: "VO-041", job: "kilby_ext",
      title: "Relocate first floor linen cupboard 300mm",
      description:
        "Megan wants the linen cupboard moved 300mm toward the stair so the bedroom door swings clear. Frame is already up, so it's a re-frame of one wall plus the associated services.",
      reason: "client_request", status: "submitted", raised: -2, markupBp: 2000, days: 1,
      lines: [
        { kind: "labour", description: "Re-frame wall and reposition opening", qty: 9, unit: "hr", unitCost: 62, markupBp: 5500 },
        { kind: "subcontractor", description: "Electrician — relocate two GPOs and a light point", qty: 0.5, unit: "day", unitCost: 880 },
        { kind: "material", description: "Framing timber and plasterboard", qty: 1, unit: "lot", unitCost: 180 },
      ],
    },
  ];

  for (const spec of specs) {
    const lines = costLines(spec.lines, spec.markupBp, GST_BP);
    const totals = sumLines(lines);

    let approvalFileId: string | null = null;
    if (spec.approved) {
      approvalFileId = await storeFile({
        prefix: "variations",
        filename: `${spec.number.toLowerCase()}-approval.svg`,
        body: documentSvg(`${spec.number} — signed approval`, spec.title, "Variation approval"),
        mimeType: "image/svg+xml",
        uploadedBy: ctx.users.greg,
      });
    }

    const [variation] = await db.insert(variations).values({
      variationNumber: spec.number,
      jobId: ctx.jobs[spec.job]!,
      title: spec.title,
      description: spec.description,
      reason: spec.reason,
      status: spec.status,
      raisedOn: dayOffset(spec.raised),
      markupBp: spec.markupBp,
      costCents: totals.costTotalCents,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      timeImpactDays: spec.days,
      submittedAt: spec.status === "draft" ? null : atTime(spec.raised, 18, 10),
      approvedAt: spec.approved ? atTime(spec.approved.at, 9, 30) : null,
      approvedByName: spec.approved?.by ?? null,
      approvalFileId,
      invoicedAt: spec.status === "invoiced" ? atTime(-9, 17, 5) : null,
      invoiceId: spec.status === "invoiced" ? ctx.invoices.kilby_prog4 ?? null : null,
      createdBy: ctx.users.greg,
    }).returning({ id: variations.id });

    await db.insert(variationLines).values(
      lines.map((line, i) => ({
        variationId: variation!.id,
        sortOrder: i,
        kind: line.kind,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitCostCents: line.unitCostCents,
        markupBp: line.markupBp,
        unitPriceCents: line.unitPriceCents,
        lineCostCents: line.lineCostCents,
        lineSubtotalCents: line.lineSubtotalCents,
        taxRateId: line.taxable ? ctx.gstRateId : ctx.gstFreeRateId,
        lineTaxCents: line.lineTaxCents,
        lineTotalCents: line.lineTotalCents,
      })),
    );
  }
}

// Re-export so 07 can attach documents without importing images twice.
export { documentSvg };
