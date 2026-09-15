import { db } from "../index";
import {
  businessSettings, taxRates, numberSequences, jobTypes, expenseCategories,
  priceBookItems, emailTemplates,
} from "../schema";
import type { Ctx } from "./context";
import { $ } from "./helpers";

export async function seedReference(ctx: Ctx) {
  /* ------------------------------- tax rates ------------------------------- */
  const rates = await db
    .insert(taxRates)
    .values([
      { name: "GST 10%", code: "GST", rateBp: 1000, isDefault: true },
      { name: "GST free", code: "FREE", rateBp: 0, isDefault: false },
    ])
    .returning({ id: taxRates.id, code: taxRates.code });

  ctx.gstRateId = rates.find((r) => r.code === "GST")!.id;
  ctx.gstFreeRateId = rates.find((r) => r.code === "FREE")!.id;

  /* ----------------------------- business details --------------------------- */
  await db.insert(businessSettings).values({
    id: "default",
    tradingName: "G. Hand & Sons",
    legalName: "G Hand & Sons Building Co Pty Ltd",
    abn: "42 118 774 903",
    acn: "118 774 903",
    licenceNumber: "QBCC 1184423",
    email: "office@ghandsons.com.au",
    phone: "(07) 3355 8821",
    website: "ghandsons.com.au",
    addressLine1: "Unit 4, 88 Enoggera Road",
    suburb: "Newmarket",
    state: "QLD",
    postcode: "4051",
    country: "Australia",
    currency: "AUD",
    locale: "en-AU",
    timezone: "Australia/Brisbane",
    financialYearStartMonth: 7,
    defaultPaymentTermsDays: 14,
    defaultMarkupBp: 2000,
    quoteValidDays: 30,
    bankAccountName: "G Hand & Sons Building Co Pty Ltd",
    bankBsb: "064-155",
    bankAccountNumber: "1029 4471",
    invoiceFooter:
      "Payment by bank transfer please. Quote the invoice number as the reference so we can match it up.",
    quoteTerms:
      "Price holds for 30 days. Based on a visual inspection — anything hidden behind walls or under floors is quoted separately as a variation before we proceed. 10% deposit on acceptance, progress claims fortnightly, balance on completion. Excludes painting and electrical certification unless listed above.",
  });

  /* ------------------------------- numbering -------------------------------- */
  await db.insert(numberSequences).values([
    { key: "job", prefix: "J-", nextValue: 1043, padding: 4 },
    { key: "quote", prefix: "Q-", nextValue: 1088, padding: 4 },
    { key: "invoice", prefix: "INV-", nextValue: 2071, padding: 4 },
    { key: "purchase_order", prefix: "PO-", nextValue: 318, padding: 4 },
    { key: "variation", prefix: "VO-", nextValue: 41, padding: 3 },
    { key: "expense", prefix: "EXP-", nextValue: 902, padding: 4 },
    { key: "incident", prefix: "INC-", nextValue: 7, padding: 3 },
  ]);

  /* ------------------------------- job types -------------------------------- */
  const types = await db
    .insert(jobTypes)
    .values([
      { name: "Kitchen renovation", colour: "#ea580c", defaultMarkupBp: 2000, sortOrder: 1 },
      { name: "Bathroom renovation", colour: "#0ea5e9", defaultMarkupBp: 2200, sortOrder: 2 },
      { name: "Extension", colour: "#7c3aed", defaultMarkupBp: 1800, sortOrder: 3 },
      { name: "Deck & pergola", colour: "#16a34a", defaultMarkupBp: 2500, sortOrder: 4 },
      { name: "Commercial fitout", colour: "#0891b2", defaultMarkupBp: 1500, sortOrder: 5 },
      { name: "Concreting", colour: "#64748b", defaultMarkupBp: 2000, sortOrder: 6 },
      { name: "Maintenance & repairs", colour: "#d97706", defaultMarkupBp: 3000, sortOrder: 7 },
      { name: "Granny flat", colour: "#be123c", defaultMarkupBp: 1800, sortOrder: 8 },
    ])
    .returning({ id: jobTypes.id, name: jobTypes.name });
  for (const t of types) ctx.jobTypes[t.name] = t.id;

  /* ---------------------------- expense categories -------------------------- */
  const cats = await db
    .insert(expenseCategories)
    .values([
      { name: "Timber & framing", kind: "material", matchKeywords: ["timber", "pine", "lvl", "mgp10", "framing", "ply"], sortOrder: 1 },
      { name: "Hardware & fixings", kind: "material", matchKeywords: ["bunnings", "screws", "bolts", "nails", "bracket", "fixing"], sortOrder: 2 },
      { name: "Plumbing supplies", kind: "material", matchKeywords: ["reece", "tradelink", "pipe", "tap", "cistern", "pvc"], sortOrder: 3 },
      { name: "Electrical supplies", kind: "material", matchKeywords: ["cable", "switchboard", "gpo", "downlight", "middys", "rexel"], sortOrder: 4 },
      { name: "Tiles & waterproofing", kind: "material", matchKeywords: ["tile", "grout", "membrane", "waterproof", "adhesive"], sortOrder: 5 },
      { name: "Concrete & steel", kind: "material", matchKeywords: ["concrete", "boral", "hanson", "mesh", "rebar", "n32"], sortOrder: 6 },
      { name: "Paint & finishes", kind: "material", matchKeywords: ["paint", "dulux", "taubmans", "primer", "undercoat"], sortOrder: 7 },
      { name: "Subcontractor", kind: "subcontractor", matchKeywords: ["electrical", "plumbing", "tiling", "plastering", "invoice"], sortOrder: 8 },
      { name: "Plant & equipment hire", kind: "plant", matchKeywords: ["kennards", "coates", "hire", "excavator", "scaffold"], sortOrder: 9 },
      { name: "Skip bins & waste", kind: "plant", matchKeywords: ["skip", "bin", "waste", "tip", "disposal"], sortOrder: 10 },
      { name: "Fuel & vehicle", kind: "other", defaultBillable: false, matchKeywords: ["fuel", "bp", "caltex", "ampol", "united", "diesel", "unleaded"], sortOrder: 11 },
      { name: "Permits & certification", kind: "other", matchKeywords: ["council", "certifier", "permit", "approval", "inspection"], sortOrder: 12 },
      { name: "Tools & consumables", kind: "other", defaultBillable: false, matchKeywords: ["blade", "drill", "battery", "ppe", "gloves", "sikaflex"], sortOrder: 13 },
      { name: "Office & admin", kind: "other", defaultBillable: false, matchKeywords: ["officeworks", "telstra", "software", "insurance", "subscription"], sortOrder: 14 },
    ])
    .returning({ id: expenseCategories.id, name: expenseCategories.name });
  for (const c of cats) ctx.categories[c.name] = c.id;

  /* ------------------------------- price book -------------------------------- */
  const items = await db
    .insert(priceBookItems)
    .values([
      { code: "LAB-CARP", name: "Carpenter", kind: "labour", unit: "hr", unitCostCents: $(62), defaultMarkupBp: 6000, taxRateId: ctx.gstRateId },
      { code: "LAB-APP", name: "Apprentice", kind: "labour", unit: "hr", unitCostCents: $(28), defaultMarkupBp: 9000, taxRateId: ctx.gstRateId },
      { code: "LAB-LAB", name: "Labourer", kind: "labour", unit: "hr", unitCostCents: $(42), defaultMarkupBp: 7000, taxRateId: ctx.gstRateId },
      { code: "LAB-SUP", name: "Site supervision", kind: "labour", unit: "hr", unitCostCents: $(78), defaultMarkupBp: 4500, taxRateId: ctx.gstRateId },
      { code: "SUB-ELEC", name: "Electrician (subcontract)", kind: "subcontractor", unit: "day", unitCostCents: $(880), defaultMarkupBp: 1500, taxRateId: ctx.gstRateId },
      { code: "SUB-PLUM", name: "Plumber (subcontract)", kind: "subcontractor", unit: "day", unitCostCents: $(920), defaultMarkupBp: 1500, taxRateId: ctx.gstRateId },
      { code: "SUB-TILE", name: "Tiler (subcontract)", kind: "subcontractor", unit: "m2", unitCostCents: $(78), defaultMarkupBp: 2000, taxRateId: ctx.gstRateId },
      { code: "SUB-PLAS", name: "Plasterer (subcontract)", kind: "subcontractor", unit: "m2", unitCostCents: $(46), defaultMarkupBp: 2000, taxRateId: ctx.gstRateId },
      { code: "SUB-PAINT", name: "Painter (subcontract)", kind: "subcontractor", unit: "m2", unitCostCents: $(34), defaultMarkupBp: 2000, taxRateId: ctx.gstRateId },
      { code: "MAT-MGP10", name: "MGP10 pine 90x45", kind: "material", unit: "lm", unitCostCents: $(7.4), defaultMarkupBp: 2500, taxRateId: ctx.gstRateId },
      { code: "MAT-LVL", name: "LVL beam 240x45", kind: "material", unit: "lm", unitCostCents: $(48), defaultMarkupBp: 2000, taxRateId: ctx.gstRateId },
      { code: "MAT-PLY", name: "Structural ply 2400x1200x17", kind: "material", unit: "sheet", unitCostCents: $(92), defaultMarkupBp: 2000, taxRateId: ctx.gstRateId },
      { code: "MAT-GYP", name: "Plasterboard 10mm 2400x1200", kind: "material", unit: "sheet", unitCostCents: $(24.5), defaultMarkupBp: 2500, taxRateId: ctx.gstRateId },
      { code: "MAT-VILLA", name: "Villaboard 6mm wet area", kind: "material", unit: "sheet", unitCostCents: $(41), defaultMarkupBp: 2500, taxRateId: ctx.gstRateId },
      { code: "MAT-WPM", name: "Waterproof membrane kit", kind: "material", unit: "kit", unitCostCents: $(168), defaultMarkupBp: 2500, taxRateId: ctx.gstRateId },
      { code: "MAT-CONC", name: "Concrete N32 (supplied)", kind: "material", unit: "m3", unitCostCents: $(268), defaultMarkupBp: 1500, taxRateId: ctx.gstRateId },
      { code: "MAT-MESH", name: "Reo mesh SL72 sheet", kind: "material", unit: "sheet", unitCostCents: $(94), defaultMarkupBp: 2000, taxRateId: ctx.gstRateId },
      { code: "MAT-DECK", name: "Merbau decking 90x19", kind: "material", unit: "lm", unitCostCents: $(9.8), defaultMarkupBp: 2500, taxRateId: ctx.gstRateId },
      { code: "MAT-TILE", name: "Floor tile 600x600 (supply)", kind: "material", unit: "m2", unitCostCents: $(52), defaultMarkupBp: 3000, taxRateId: ctx.gstRateId },
      { code: "PLT-SKIP", name: "Skip bin 6m3", kind: "plant", unit: "ea", unitCostCents: $(430), defaultMarkupBp: 1500, taxRateId: ctx.gstRateId },
      { code: "PLT-SCAF", name: "Scaffold hire", kind: "plant", unit: "week", unitCostCents: $(340), defaultMarkupBp: 2000, taxRateId: ctx.gstRateId },
      { code: "PLT-EXC", name: "Excavator 1.7t + operator", kind: "plant", unit: "day", unitCostCents: $(640), defaultMarkupBp: 2000, taxRateId: ctx.gstRateId },
      { code: "OTH-PERMIT", name: "Building approval & certifier", kind: "other", unit: "ea", unitCostCents: $(1450), defaultMarkupBp: 1000, taxRateId: ctx.gstRateId },
      { code: "OTH-DESIGN", name: "Drafting & engineering", kind: "other", unit: "ea", unitCostCents: $(2200), defaultMarkupBp: 1000, taxRateId: ctx.gstRateId },
    ])
    .returning({ id: priceBookItems.id, code: priceBookItems.code });
  for (const i of items) ctx.priceBook[i.code] = i.id;

  /* ----------------------------- email templates ----------------------------- */
  await db.insert(emailTemplates).values([
    {
      key: "quote_send",
      name: "Send a quote",
      subject: "Quote {{quote_number}} — {{job_title}}",
      body: `Hi {{client_first_name}},

Thanks for having us out. Our quote for {{job_title}} at {{site_address}} is attached — {{quote_total}} including GST.

It's good for {{valid_days}} days. Happy to walk you through any of it, just give me a call.

Cheers,
{{sender_name}}
G. Hand & Sons — QBCC 1184423`,
    },
    {
      key: "invoice_send",
      name: "Send an invoice",
      subject: "Invoice {{invoice_number}} — {{job_title}}",
      body: `Hi {{client_first_name}},

Invoice {{invoice_number}} for {{job_title}} is attached: {{invoice_total}} including GST, due {{due_date}}.

Bank details are on the invoice. Please use {{invoice_number}} as the reference.

Thanks again,
{{sender_name}}
G. Hand & Sons`,
    },
    {
      key: "invoice_overdue",
      name: "Overdue reminder",
      subject: "Friendly reminder — invoice {{invoice_number}}",
      body: `Hi {{client_first_name}},

Just a quick reminder that invoice {{invoice_number}} for {{invoice_total}} was due on {{due_date}}, so it's now {{days_overdue}} days past.

If it's already gone through, ignore this. If something's holding it up, let me know and we'll sort it.

Cheers,
{{sender_name}}`,
    },
    {
      key: "variation_approval",
      name: "Variation for approval",
      subject: "Variation {{variation_number}} for approval — {{job_title}}",
      body: `Hi {{client_first_name}},

We've hit something on site that changes the scope: {{variation_title}}.

{{variation_description}}

The extra cost is {{variation_total}} including GST, and it adds about {{time_impact_days}} days.

We can't proceed on that part until you give us the nod — reply to this email and we'll get on with it.

Cheers,
{{sender_name}}`,
    },
  ]);
}
