import { db } from "../index";
import {
  jobPhotos, fileLinks, complianceItems, safetyDocs, safetySignoffs, incidents,
  auditLog, notifications,
} from "../schema";
import type { Ctx } from "./context";
import { dayOffset, atTime } from "./context";
import { storeFile } from "./helpers";
import { photoSvg, documentSvg } from "./images";

export async function seedSite(ctx: Ctx) {
  await seedPhotos(ctx);
  await seedDocuments(ctx);
  await seedCompliance(ctx);
  await seedAuditTrail(ctx);
  await seedNotifications(ctx);
}

/* --------------------------------- photos --------------------------------- */

const PHOTOS: Array<{
  job: string; label: string; caption: string; scene: string;
  category: "progress" | "defect" | "before" | "after" | "compliance";
  day: number; by: string;
}> = [
  { job: "kilby_ext", label: "Before — rear elevation", caption: "Existing rear wall before demolition", scene: "brick", category: "before", day: -38, by: "greg" },
  { job: "kilby_ext", label: "Footings poured", caption: "Piered footings to the fall of the site", scene: "concrete", category: "progress", day: -34, by: "jake" },
  { job: "kilby_ext", label: "Ground floor slab", caption: "Slab poured and finished, curing 7 days", scene: "concrete", category: "progress", day: -30, by: "jake" },
  { job: "kilby_ext", label: "Termite damage found", caption: "Bottom plate eaten through — see VO-038", scene: "defect", category: "defect", day: -31, by: "jake" },
  { job: "kilby_ext", label: "Ground floor frame up", caption: "6m LVL portal in and propped", scene: "frame", category: "progress", day: -22, by: "marco" },
  { job: "kilby_ext", label: "First floor framing", caption: "First floor walls and floor system complete", scene: "frame", category: "progress", day: -8, by: "marco" },
  { job: "kilby_ext", label: "Roof frame", caption: "Trusses set out, battens going on today", scene: "roof", category: "progress", day: -1, by: "jake" },
  { job: "kilby_ext", label: "Scaffold and edge protection", caption: "Fall protection to rear elevation above 2m", scene: "frame", category: "compliance", day: -28, by: "greg" },
  { job: "cpg_u3", label: "Before — main bathroom", caption: "Original 1970s bathroom before strip out", scene: "interior", category: "before", day: -8, by: "marco" },
  { job: "cpg_u3", label: "Corroded waste stack", caption: "Cast iron rusted through — VO-040", scene: "defect", category: "defect", day: -5, by: "marco" },
  { job: "cpg_u3", label: "Waterproofing complete", caption: "Two coats to AS 3740, 24hr cure before tiling", scene: "interior", category: "progress", day: -2, by: "marco" },
  { job: "whitfield_kitchen", label: "Finished kitchen", caption: "Stone benchtops and new laundry in the old pantry", scene: "interior", category: "after", day: -60, by: "jake" },
  { job: "raman_deck", label: "Finished deck", caption: "42m2 merbau deck with colorbond pergola", scene: "frame", category: "after", day: -16, by: "jake" },
  { job: "whitfield_ensuite", label: "Cracked tile", caption: "Movement crack across four tiles", scene: "defect", category: "defect", day: -4, by: "marco" },
  { job: "whitfield_ensuite", label: "Repair complete", caption: "Tiles replaced and shower junction resealed", scene: "interior", category: "after", day: -4, by: "marco" },
];

async function seedPhotos(ctx: Ctx) {
  for (const [i, p] of PHOTOS.entries()) {
    const fileId = await storeFile({
      prefix: "photos",
      filename: `${p.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`,
      body: photoSvg({ label: p.label, caption: p.caption, scene: p.scene, stamp: dayOffset(p.day) }),
      mimeType: "image/svg+xml",
      uploadedBy: ctx.users[p.by]!,
      width: 800,
      height: 600,
    });

    await db.insert(jobPhotos).values({
      jobId: ctx.jobs[p.job]!,
      fileId,
      caption: p.caption,
      category: p.category,
      takenAt: atTime(p.day, 10 + (i % 6)),
      uploadedBy: ctx.users[p.by]!,
      sortOrder: i,
    });
  }
}

/* -------------------------------- documents -------------------------------- */

const DOCS: Array<{ job: string; title: string; kind: string; subtitle: string; by: string }> = [
  { job: "kilby_ext", title: "Architectural drawings — Rev C", kind: "plan", subtitle: "31 Waterworks Rd, Ashgrove — two-storey rear extension", by: "greg" },
  { job: "kilby_ext", title: "Structural engineering — portal beam", kind: "plan", subtitle: "Certified by Hallam & Co, RPEQ 14892", by: "greg" },
  { job: "kilby_ext", title: "Development approval A00481223", kind: "permit", subtitle: "Brisbane City Council — approved with conditions", by: "donna" },
  { job: "kilby_ext", title: "Form 15 — structural design certificate", kind: "permit", subtitle: "Portal beam and first floor framing", by: "greg" },
  { job: "kilby_ext", title: "Signed contract — HIA renovation", kind: "signed", subtitle: "Executed by D & M Kilby", by: "donna" },
  { job: "cpg_u3", title: "Asbestos register — Marlow Court", kind: "compliance", subtitle: "1970s block — eaves sheeting identified, do not disturb", by: "greg" },
  { job: "cpg_u3", title: "Waterproofing certificate", kind: "compliance", subtitle: "AS 3740 compliance — applied by M. Ferraro", by: "marco" },
  { job: "dental_fitout", title: "Joinery shop drawings", kind: "plan", subtitle: "Reception counter — approved by Dr Sharma", by: "greg" },
  { job: "dental_fitout", title: "After hours access agreement", kind: "signed", subtitle: "Long weekend works — alarm and key protocol", by: "donna" },
  { job: "nguyen_flat", title: "Site plan and setbacks", kind: "plan", subtitle: "7 Bellevue Ave — secondary dwelling", by: "greg" },
];

async function seedDocuments(ctx: Ctx) {
  for (const doc of DOCS) {
    const fileId = await storeFile({
      prefix: "documents",
      filename: `${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`,
      body: documentSvg(doc.title, doc.subtitle, doc.kind),
      mimeType: "image/svg+xml",
      uploadedBy: ctx.users[doc.by]!,
    });

    await db.insert(fileLinks).values({
      fileId,
      entityType: "job",
      entityId: ctx.jobs[doc.job]!,
      kind: doc.kind,
      title: doc.title,
      notes: doc.subtitle,
      uploadedBy: ctx.users[doc.by]!,
    });
  }
}

/* -------------------------------- compliance ------------------------------- */

async function seedCompliance(ctx: Ctx) {
  const items: Array<{
    subjectType: "business" | "worker" | "subcontractor" | "supplier";
    subject: string | null; label: string;
    kind: "licence" | "insurance" | "certification" | "registration" | "induction";
    name: string; identifier?: string; issuer?: string; issue: number; expiry: number;
    coverage?: number; remind?: number;
  }> = [
    { subjectType: "business", subject: null, label: "G. Hand & Sons", kind: "licence", name: "QBCC contractor licence", identifier: "1184423", issuer: "QBCC", issue: -320, expiry: 45 },
    { subjectType: "business", subject: null, label: "G. Hand & Sons", kind: "insurance", name: "Public liability $20m", identifier: "PL-4482190", issuer: "CGU", issue: -180, expiry: 185, coverage: 20_000_000 },
    { subjectType: "business", subject: null, label: "G. Hand & Sons", kind: "insurance", name: "Workers compensation", identifier: "WC-118773", issuer: "WorkCover QLD", issue: -76, expiry: 289 },
    { subjectType: "business", subject: null, label: "G. Hand & Sons", kind: "insurance", name: "Tools & plant cover", identifier: "TP-90214", issuer: "CGU", issue: -180, expiry: 12 },
    { subjectType: "worker", subject: "greg", label: "Greg Hand", kind: "licence", name: "White card", identifier: "WC-0094412", issuer: "WorkSafe QLD", issue: -2400, expiry: 3600 },
    { subjectType: "worker", subject: "greg", label: "Greg Hand", kind: "licence", name: "Site supervisor licence", identifier: "SS-118441", issuer: "QBCC", issue: -320, expiry: 45 },
    { subjectType: "worker", subject: "jake", label: "Jake Hand", kind: "licence", name: "White card", identifier: "WC-0118772", issuer: "WorkSafe QLD", issue: -1800, expiry: 4200 },
    { subjectType: "worker", subject: "jake", label: "Jake Hand", kind: "certification", name: "Working at heights", identifier: "WAH-22841", issuer: "SafeTrain QLD", issue: -640, expiry: 96 },
    { subjectType: "worker", subject: "jake", label: "Jake Hand", kind: "certification", name: "First aid & CPR", identifier: "FA-77213", issuer: "St John", issue: -700, expiry: 26 },
    { subjectType: "worker", subject: "marco", label: "Marco Ferraro", kind: "licence", name: "White card", identifier: "WC-0122891", issuer: "WorkSafe QLD", issue: -1600, expiry: 4400 },
    { subjectType: "worker", subject: "marco", label: "Marco Ferraro", kind: "certification", name: "Waterproofing accreditation", identifier: "WP-4429", issuer: "ATWA", issue: -400, expiry: 330 },
    { subjectType: "worker", subject: "marco", label: "Marco Ferraro", kind: "certification", name: "Working at heights", identifier: "WAH-22902", issuer: "SafeTrain QLD", issue: -740, expiry: -12 },
    { subjectType: "worker", subject: "tyler", label: "Tyler Nguyen", kind: "licence", name: "White card", identifier: "WC-0140028", issuer: "WorkSafe QLD", issue: -900, expiry: 5100 },
    { subjectType: "worker", subject: "tyler", label: "Tyler Nguyen", kind: "registration", name: "Apprenticeship registration", identifier: "APP-882104", issuer: "DESBT", issue: -940, expiry: 220 },
    { subjectType: "worker", subject: "tyler", label: "Tyler Nguyen", kind: "induction", name: "Blue card (working with children)", identifier: "BC-1180043", issuer: "QLD Government", issue: -300, expiry: 795 },
    { subjectType: "subcontractor", subject: "wes", label: "Kelly Electrical (Wes Kelly)", kind: "licence", name: "Electrical contractor licence", identifier: "EC-77281", issuer: "Electrical Safety Office", issue: -290, expiry: 74 },
    { subjectType: "subcontractor", subject: "wes", label: "Kelly Electrical (Wes Kelly)", kind: "insurance", name: "Public liability $10m", identifier: "PL-KE-2218", issuer: "Allianz", issue: -240, expiry: 8, coverage: 10_000_000 },
    { subjectType: "subcontractor", subject: "sam", label: "Northside Plumbing (Sam Okafor)", kind: "licence", name: "Plumbing & drainage licence", identifier: "PD-118420", issuer: "QBCC", issue: -200, expiry: 164 },
    { subjectType: "subcontractor", subject: "sam", label: "Northside Plumbing (Sam Okafor)", kind: "insurance", name: "Public liability $10m", identifier: "PL-NP-8841", issuer: "QBE", issue: -160, expiry: 205, coverage: 10_000_000 },
  ];

  for (const item of items) {
    const fileId = await storeFile({
      prefix: "compliance",
      filename: `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`,
      body: documentSvg(item.name, `${item.label} — ${item.identifier ?? ""}`, item.kind),
      mimeType: "image/svg+xml",
      uploadedBy: ctx.users.donna,
    });

    await db.insert(complianceItems).values({
      subjectType: item.subjectType,
      subjectId: item.subject ? ctx.users[item.subject]! : null,
      subjectLabel: item.label,
      kind: item.kind,
      name: item.name,
      identifier: item.identifier ?? null,
      issuer: item.issuer ?? null,
      issueDate: dayOffset(item.issue),
      expiryDate: dayOffset(item.expiry),
      coverageCents: item.coverage ? item.coverage * 100 : null,
      fileId,
      remindDaysBefore: item.remind ?? 30,
    });
  }

  /* ------------------------------- SWMS etc. ------------------------------- */
  const swms: Array<{ job: string; kind: "swms" | "jsa" | "risk_assessment" | "toolbox_talk"; title: string; risks: string[]; signers: string[] }> = [
    { job: "kilby_ext", kind: "swms", title: "SWMS — work at height, rear elevation", risks: ["Work above 2m", "Powered mobile plant"], signers: ["greg", "jake", "marco", "tyler"] },
    { job: "kilby_ext", kind: "swms", title: "SWMS — structural demolition of load bearing wall", risks: ["Structural alterations", "Falling objects"], signers: ["greg", "jake", "marco"] },
    { job: "kilby_ext", kind: "toolbox_talk", title: "Toolbox talk — wet weather and slip hazards", risks: [], signers: ["jake", "marco", "tyler"] },
    { job: "cpg_u3", kind: "swms", title: "SWMS — asbestos awareness, no disturbance of eaves", risks: ["Asbestos"], signers: ["marco", "tyler"] },
    { job: "dental_fitout", kind: "risk_assessment", title: "Risk assessment — medical gas isolation, ceiling works", risks: ["Confined space", "Hazardous services"], signers: ["greg", "jake"] },
  ];

  for (const doc of swms) {
    const fileId = await storeFile({
      prefix: "safety",
      filename: `${doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`,
      body: documentSvg(doc.title, doc.risks.join(" · ") || "Site safety record", doc.kind),
      mimeType: "image/svg+xml",
      uploadedBy: ctx.users.greg,
    });

    const [row] = await db
      .insert(safetyDocs)
      .values({
        jobId: ctx.jobs[doc.job]!,
        kind: doc.kind,
        title: doc.title,
        version: "1",
        fileId,
        validFrom: dayOffset(-40),
        validTo: dayOffset(120),
        highRiskActivities: doc.risks,
        createdBy: ctx.users.greg,
      })
      .returning({ id: safetyDocs.id });

    await db.insert(safetySignoffs).values(
      doc.signers.map((who, i) => ({
        safetyDocId: row!.id,
        userId: ctx.users[who]!,
        signedName: who === "greg" ? "Greg Hand" : who === "jake" ? "Jake Hand" : who === "marco" ? "Marco Ferraro" : "Tyler Nguyen",
        signedAt: atTime(-38 + i, 7, 10 + i * 4),
      })),
    );
  }

  /* -------------------------------- incidents ------------------------------- */
  await db.insert(incidents).values([
    {
      incidentNumber: "INC-004", jobId: ctx.jobs.kilby_ext!, occurredAt: atTime(-26, 14, 20),
      severity: "near_miss", personInvolved: "Tyler Nguyen",
      description: "A bundle of battens slid off the first floor edge and landed in the exclusion zone below. Nobody underneath at the time.",
      immediateAction: "Work stopped, area re-checked, remaining bundles strapped and moved back from the edge.",
      correctiveAction: "Edge protection extended along the full rear elevation. Toolbox talk held the next morning on material storage near edges.",
      status: "closed", closedAt: atTime(-24, 16, 0), reportedBy: ctx.users.jake,
    },
    {
      incidentNumber: "INC-005", jobId: ctx.jobs.cpg_u3!, occurredAt: atTime(-6, 9, 45),
      severity: "first_aid", personInvolved: "Marco Ferraro",
      description: "Small cut to the left hand on a broken tile edge while removing the old floor. Cleaned and dressed on site.",
      immediateAction: "First aid applied from the ute kit. Marco continued work with a glove.",
      correctiveAction: "Cut-resistant gloves added to the standard PPE for tile strip out.",
      status: "closed", closedAt: atTime(-5, 10, 0), reportedBy: ctx.users.marco,
    },
    {
      incidentNumber: "INC-006", jobId: ctx.jobs.kilby_ext!, occurredAt: atTime(-3, 11, 15),
      severity: "near_miss", personInvolved: "Site visitor",
      description: "The client's neighbour walked under the scaffold to look at the job while sheeting was being lifted.",
      immediateAction: "Lift stopped, visitor escorted out of the area.",
      correctiveAction: "Bunting and signage installed at the side gate. Client asked to let neighbours know.",
      status: "open", reportedBy: ctx.users.greg,
    },
  ]);
}

/* ------------------------------- audit trail ------------------------------- */

async function seedAuditTrail(ctx: Ctx) {
  await db.insert(auditLog).values([
    { entityType: "invoice", entityId: ctx.invoices.kilby_prog4!, action: "create", actorUserId: ctx.users.donna, actorLabel: "Donna Hand", summary: "Raised invoice INV-2069 for $70,070.00", amountCents: 7_007_000, createdAt: atTime(-9, 16, 40) },
    { entityType: "invoice", entityId: ctx.invoices.kilby_prog4!, action: "send", actorUserId: ctx.users.donna, actorLabel: "Donna Hand", summary: "Sent INV-2069 to meg.kilby@bigpond.com", createdAt: atTime(-9, 17, 5) },
    { entityType: "invoice", entityId: ctx.invoices.kilby_prog4!, action: "payment", actorUserId: ctx.users.donna, actorLabel: "Donna Hand", summary: "Recorded part payment of $40,000.00 against INV-2069", amountCents: 4_000_000, createdAt: atTime(-3, 9, 12) },
    { entityType: "invoice", entityId: ctx.invoices.deck_final!, action: "create", actorUserId: ctx.users.donna, actorLabel: "Donna Hand", summary: "Raised invoice INV-2065 for $44,786.50", amountCents: 4_478_650, createdAt: atTime(-38, 15, 10) },
    { entityType: "invoice", entityId: ctx.invoices.deck_final!, action: "status_change", actorUserId: null, actorLabel: "System", summary: "INV-2065 moved to Overdue (24 days past due)", changes: { status: { from: "sent", to: "overdue" } }, createdAt: atTime(-24, 6, 0) },
    { entityType: "quote", entityId: ctx.quotes.nguyen!, action: "approve", actorUserId: ctx.users.greg, actorLabel: "Greg Hand", summary: "Marked Q-1081 accepted by Hien Nguyen", amountCents: null, createdAt: atTime(-4, 10, 5) },
    { entityType: "job", entityId: ctx.jobs.kilby_ext!, action: "status_change", actorUserId: ctx.users.greg, actorLabel: "Greg Hand", summary: "J-0031 moved from Scheduled to On site", changes: { status: { from: "scheduled", to: "in_progress" } }, createdAt: atTime(-36, 7, 15) },
    { entityType: "variation", entityId: ctx.jobs.kilby_ext!, action: "approve", actorUserId: ctx.users.greg, actorLabel: "Greg Hand", summary: "VO-038 approved by Megan Kilby — $2,619.20", amountCents: 261_920, createdAt: atTime(-29, 9, 30) },
    { entityType: "expense", entityId: ctx.jobs.cpg_u3!, action: "create", actorUserId: ctx.users.marco, actorLabel: "Marco Ferraro", summary: "Saved receipt from Handy Skips — $341.00 to J-0034", amountCents: 34_100, createdAt: atTime(-3, 18, 22) },
    { entityType: "timesheet", entityId: ctx.users.jake!, action: "approve", actorUserId: ctx.users.greg, actorLabel: "Greg Hand", summary: "Approved Jake Hand's timesheet — 40.0 hrs, $2,480.00", amountCents: 248_000, createdAt: atTime(-8, 19, 30) },
  ]);
}

/* ------------------------------- notifications ------------------------------ */

async function seedNotifications(ctx: Ctx) {
  await db.insert(notifications).values([
    { userId: ctx.users.greg, kind: "invoice_overdue", title: "INV-2065 is 24 days overdue", body: "Priya Raman — $44,786.50 outstanding on the Paddington deck.", href: "/invoices", severity: "danger" },
    { userId: ctx.users.greg, kind: "compliance_expiry", title: "Marco's working at heights ticket has expired", body: "Expired 12 days ago. He's booked on the Ashgrove roof this week.", href: "/compliance", severity: "danger" },
    { userId: ctx.users.greg, kind: "compliance_expiry", title: "Kelly Electrical public liability expires in 8 days", body: "Get the new certificate of currency before Wes is back on site.", href: "/compliance", severity: "warning" },
    { userId: ctx.users.greg, kind: "variation_pending", title: "VO-041 is waiting on Megan Kilby", body: "Raised 2 days ago. The wall can't be sheeted until she decides.", href: "/jobs", severity: "warning" },
    { userId: ctx.users.greg, kind: "budget", title: "J-0031 labour is tracking over budget", body: "Ashgrove extension — labour actuals have passed the allowance with the roof still to go.", href: "/jobs", severity: "warning" },
    { userId: ctx.users.donna, kind: "receipts", title: "5 receipts waiting to be checked", body: "Greg and the boys have been snapping dockets all week.", href: "/receipts", severity: "info" },
  ]);
}
