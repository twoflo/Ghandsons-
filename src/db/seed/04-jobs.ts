import { eq } from "drizzle-orm";
import { marginBp } from "../../lib/money";
import { db } from "../index";
import { jobs, jobAssignments, jobStatusHistory, jobNotes, quotes, quoteLines } from "../schema";
import type { Ctx } from "./context";
import { dayOffset, atTime, GST_BP } from "./context";
import { $, costLines, sumLines, type LineSpec } from "./helpers";

type JobSpec = {
  key: string;
  number: string;
  title: string;
  client: string;
  site: string;
  type: string;
  status:
    | "lead" | "quoted" | "won" | "scheduled" | "in_progress"
    | "complete" | "invoiced" | "paid" | "lost";
  description: string;
  start?: number;
  end?: number;
  actualStart?: number;
  actualEnd?: number;
  contract?: number;
  budget?: { labour: number; material: number; sub: number; plant: number; other: number };
  crew?: Array<[string, string]>;
  priority?: boolean;
  lostReason?: string;
  leadSource?: string;
  notes?: string;
};

const JOB_SPECS: JobSpec[] = [
  {
    key: "kilby_ext", number: "J-0031", title: "Two-storey rear extension",
    client: "kilby", site: "Home — Ashgrove", type: "Extension", status: "in_progress",
    description:
      "Rear extension: new 6x7m ground floor living area and a first floor with two bedrooms and a bathroom. Existing rear wall opened up with a 6m LVL portal. Family staying in the house throughout.",
    start: -38, end: 34, actualStart: -36, contract: 318_500,
    budget: { labour: 96_000, material: 84_000, sub: 61_000, plant: 9_800, other: 11_400 },
    crew: [["greg", "supervisor"], ["jake", "lead"], ["marco", "crew"], ["tyler", "apprentice"]],
    priority: true,
    notes: "Biggest job on the books. Watch the labour — we're already ahead of where we should be at this stage.",
  },
  {
    key: "cpg_u3", number: "J-0034", title: "Unit 3 bathroom refit",
    client: "cpg", site: "Marlow Court — Unit 3", type: "Bathroom renovation", status: "in_progress",
    description:
      "Strip out and refit the main bathroom. New waterproofing, floor and wall tiles, vanity, toilet suite and shower screen. Tenant out for the duration.",
    start: -8, end: 6, actualStart: -8, contract: 24_800,
    budget: { labour: 6_400, material: 7_100, sub: 5_900, plant: 620, other: 380 },
    crew: [["marco", "lead"], ["tyler", "apprentice"]],
  },
  {
    key: "dental_fitout", number: "J-0036", title: "Reception & waiting room fitout",
    client: "dental", site: "Surgery — Holland Park", type: "Commercial fitout", status: "scheduled",
    description:
      "New reception joinery, waiting room ceiling and lighting, vinyl flooring throughout the front of house. Must be done over the long weekend — surgery reopens Tuesday 7am regardless.",
    start: 18, end: 21, contract: 41_200,
    budget: { labour: 9_800, material: 14_600, sub: 8_400, plant: 1_200, other: 900 },
    crew: [["greg", "supervisor"], ["jake", "lead"], ["marco", "crew"]],
    priority: true,
  },
  {
    key: "nguyen_flat", number: "J-0038", title: "Granny flat — 2 bed",
    client: "nguyen", site: "Home — Stafford", type: "Granny flat", status: "won",
    description:
      "Detached two bedroom secondary dwelling, 58m2, slab on ground. Waiting on the council approval before we can book anything in.",
    start: 28, end: 132, contract: 186_000,
    budget: { labour: 52_000, material: 61_000, sub: 38_000, plant: 5_400, other: 8_600 },
    crew: [["greg", "supervisor"]],
    notes: "Don't order anything until the DA lands. Hien verbally accepted on the phone — get it in writing.",
  },
  {
    key: "osborne_bath", number: "J-0039", title: "Main bathroom renovation",
    client: "osborne", site: "Home — Camp Hill", type: "Bathroom renovation", status: "quoted",
    description:
      "Full strip out and refit of a 1960s bathroom. Ray wants a walk-in shower, no bath. Possible rot in the floor under the old shower base — flagged as a provisional sum.",
    start: 24, end: 38, contract: 0,
    budget: { labour: 0, material: 0, sub: 0, plant: 0, other: 0 },
    leadSource: "Signage on the Camp Hill job",
  },
  {
    key: "cpg_u7", number: "J-0040", title: "Unit 7 kitchen replacement",
    client: "cpg", site: "Marlow Court — Unit 7", type: "Kitchen renovation", status: "quoted",
    description: "Like-for-like kitchen replacement between tenancies. Same footprint, laminate benchtop, flat pack carcasses supplied by us.",
    start: 20, end: 30,
  },
  {
    key: "bce_staff", number: "J-0041", title: "Staff room refresh — budget figure",
    client: "bce", site: "St Brendan's — staff room", type: "Commercial fitout", status: "lead",
    description:
      "Paul needs a ballpark for their capital works submission. New kitchenette, paint, flooring, and replace the ceiling grid. Holidays only. Not a firm quote yet.",
    leadSource: "Enquiry through the website",
  },
  {
    key: "whitfield_kitchen", number: "J-0026", title: "Kitchen & laundry renovation",
    client: "whitfield", site: "Home — Bardon", type: "Kitchen renovation", status: "paid",
    description:
      "Full kitchen replacement with stone benchtops and a new laundry in the old pantry. Came in slightly under budget.",
    start: -96, end: -62, actualStart: -95, actualEnd: -60, contract: 68_400,
    budget: { labour: 18_200, material: 24_800, sub: 9_600, plant: 1_400, other: 1_100 },
    crew: [["jake", "lead"], ["marco", "crew"], ["tyler", "apprentice"]],
  },
  {
    key: "raman_deck", number: "J-0029", title: "Rear deck & pergola",
    client: "raman", site: "Home — Paddington", type: "Deck & pergola", status: "invoiced",
    description:
      "42m2 merbau deck at first floor level with a colorbond pergola over half. Steel posts to footings, handrail to code.",
    start: -44, end: -18, actualStart: -44, actualEnd: -16, contract: 47_900,
    budget: { labour: 13_400, material: 16_200, sub: 4_200, plant: 2_100, other: 1_800 },
    crew: [["jake", "lead"], ["tyler", "apprentice"]],
  },
  {
    key: "whitfield_ensuite", number: "J-0042", title: "Ensuite tile repair",
    client: "whitfield", site: "Home — Bardon", type: "Maintenance & repairs", status: "complete",
    description:
      "Cracked floor tile in the ensuite, likely slab movement rather than the tiling. Replaced four tiles and re-grouted the shower junction.",
    start: -4, end: -4, actualStart: -4, actualEnd: -4, contract: 1_180,
    budget: { labour: 420, material: 260, sub: 0, plant: 0, other: 40 },
    crew: [["marco", "lead"]],
  },
  {
    key: "kilby_carport", number: "J-0022", title: "Carport slab & drainage",
    client: "kilby", site: "Home — Ashgrove", type: "Concreting", status: "paid",
    description: "34m2 reinforced slab for the carport plus a spoon drain to the street. Done before the extension started.",
    start: -140, end: -132, actualStart: -140, actualEnd: -131, contract: 14_600,
    budget: { labour: 3_800, material: 6_900, sub: 0, plant: 1_600, other: 300 },
    crew: [["jake", "lead"], ["tyler", "apprentice"]],
  },
  {
    key: "raman_fence", number: "J-0033", title: "Front fence & gate",
    client: "raman", site: "Home — Paddington", type: "Maintenance & repairs", status: "lost",
    description: "Hardwood picket fence and an automated gate to the street.",
    lostReason: "Went with a fencing specialist, about 20% cheaper. Not really our line of work.",
  },
];

export async function seedJobs(ctx: Ctx) {
  for (const spec of JOB_SPECS) {
    const b = spec.budget ?? { labour: 0, material: 0, sub: 0, plant: 0, other: 0 };
    const [row] = await db
      .insert(jobs)
      .values({
        jobNumber: spec.number,
        title: spec.title,
        clientId: ctx.clients[spec.client]!,
        siteId: ctx.sites[spec.site]!,
        jobTypeId: ctx.jobTypes[spec.type]!,
        status: spec.status,
        description: spec.description,
        isPriority: spec.priority ?? false,
        startDate: spec.start !== undefined ? dayOffset(spec.start) : null,
        endDate: spec.end !== undefined ? dayOffset(spec.end) : null,
        actualStartDate: spec.actualStart !== undefined ? dayOffset(spec.actualStart) : null,
        actualEndDate: spec.actualEnd !== undefined ? dayOffset(spec.actualEnd) : null,
        contractValueCents: $(spec.contract ?? 0),
        budgetLabourCents: $(b.labour),
        budgetMaterialCents: $(b.material),
        budgetSubcontractorCents: $(b.sub),
        budgetPlantCents: $(b.plant),
        budgetOtherCents: $(b.other),
        targetMarginBp: 2000,
        leadSource: spec.leadSource ?? null,
        lostReason: spec.lostReason ?? null,
        notes: spec.notes ?? null,
        createdBy: ctx.users.greg,
      })
      .returning({ id: jobs.id });

    ctx.jobs[spec.key] = row!.id;

    if (spec.crew?.length) {
      await db.insert(jobAssignments).values(
        spec.crew.map(([who, roleOnJob]) => ({
          jobId: row!.id,
          userId: ctx.users[who]!,
          roleOnJob,
        })),
      );
    }

    // A plausible trail of how it got to where it is.
    const flow = ["lead", "quoted", "won", "scheduled", "in_progress", "complete", "invoiced", "paid"];
    const target = flow.indexOf(spec.status);
    const history = target >= 0 ? flow.slice(0, target + 1) : ["lead", "quoted", spec.status];
    let previous: string | null = null;
    const span = spec.start ?? -20;
    await db.insert(jobStatusHistory).values(
      history.map((status, i) => {
        const entry = {
          jobId: row!.id,
          fromStatus: previous,
          toStatus: status,
          changedBy: ctx.users.greg,
          createdAt: atTime(Math.round(span - 14 + i * 5), 8 + (i % 6)),
        };
        previous = status;
        return entry;
      }),
    );
  }

  await db.insert(jobNotes).values([
    { jobId: ctx.jobs.kilby_ext!, body: "Ground floor slab poured and cured. Portal beam in and propped — engineer signed off Tuesday.", createdBy: ctx.users.jake, pinned: true },
    { jobId: ctx.jobs.kilby_ext!, body: "Two days lost to rain last week. Roof pushed back to the 22nd. Megan's been told.", createdBy: ctx.users.greg },
    { jobId: ctx.jobs.kilby_ext!, body: "Megan wants the linen cupboard moved 300mm. Priced as VO-041, waiting on her.", createdBy: ctx.users.greg, pinned: true },
    { jobId: ctx.jobs.cpg_u3!, body: "Waterproofing done Thursday, 24hr cure before the tiler starts Monday.", createdBy: ctx.users.marco },
    { jobId: ctx.jobs.cpg_u3!, body: "Old cast iron waste was rusted through — replaced it. Extra plumbing on the docket.", createdBy: ctx.users.marco },
    { jobId: ctx.jobs.dental_fitout!, body: "Joinery lead time is 3 weeks. Order goes in Monday or we miss the weekend.", createdBy: ctx.users.greg, pinned: true },
    { jobId: ctx.jobs.osborne_bath!, body: "Ray is also getting a price from a mob in Carina. Follow up Friday.", createdBy: ctx.users.greg },
  ]);

  await seedQuotes(ctx);
}

/* --------------------------------- quotes --------------------------------- */

type QuoteSpec = {
  key: string;
  number: string;
  title: string;
  client: string;
  site: string;
  job?: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  issued: number;
  valid: number;
  markupBp: number;
  scope: string;
  exclusions?: string;
  accepted?: { at: number; by: string };
  rejected?: { at: number; reason: string };
  lines: LineSpec[];
};

const QUOTE_SPECS: QuoteSpec[] = [
  {
    key: "osborne", number: "Q-1086", title: "Main bathroom renovation — 62 Sandringham St",
    client: "osborne", site: "Home — Camp Hill", job: "osborne_bath",
    status: "sent", issued: -5, valid: 25, markupBp: 2200,
    scope:
      "Strip out the existing bathroom back to studs and slab. Rectify any rot found in the floor framing (provisional sum). New waterproofing to AS 3740, floor and wall tiling, walk-in shower with a linear drain, wall hung vanity, back-to-wall toilet suite, heated towel rail, exhaust fan and new lighting.",
    exclusions:
      "Excludes: relocating the existing window, asbestos removal if any is found, painting outside the bathroom, and any works to the plumbing under the slab.",
    lines: [
      { kind: "labour", description: "Strip out and make good", qty: 16, unit: "hr", unitCost: 62, markupBp: 6000 },
      { kind: "labour", description: "Carpentry — framing, villaboard, fit off", qty: 34, unit: "hr", unitCost: 62, markupBp: 6000 },
      { kind: "subcontractor", description: "Plumber — rough in and fit off", qty: 2.5, unit: "day", unitCost: 920 },
      { kind: "subcontractor", description: "Electrician — lighting, fan, towel rail circuit", qty: 1, unit: "day", unitCost: 880 },
      { kind: "subcontractor", description: "Tiling — floor and full height walls", qty: 32, unit: "m2", unitCost: 78 },
      { kind: "material", description: "Villaboard, framing and fixings", qty: 1, unit: "lot", unitCost: 980 },
      { kind: "material", description: "Waterproofing system", qty: 1, unit: "kit", unitCost: 336 },
      { kind: "material", description: "Tiles — floor and wall (allowance $55/m2)", qty: 32, unit: "m2", unitCost: 55 },
      { kind: "material", description: "Tapware, vanity, toilet suite, shower screen (PC sum)", qty: 1, unit: "lot", unitCost: 3_850, markupBp: 1000 },
      { kind: "plant", description: "Skip bin", qty: 1, unit: "ea", unitCost: 430 },
      { kind: "other", description: "Provisional sum — floor framing rectification", qty: 1, unit: "sum", unitCost: 1_200, markupBp: 0 },
    ],
  },
  {
    key: "cpg_u7", number: "Q-1087", title: "Unit 7 kitchen replacement — Marlow Court",
    client: "cpg", site: "Marlow Court — Unit 7", job: "cpg_u7",
    status: "sent", issued: -2, valid: 28, markupBp: 1800,
    scope:
      "Remove the existing kitchen and dispose. Supply and install new flat pack carcasses in the same footprint, laminate benchtop with a post-formed edge, new stainless sink and mixer, and reconnect the existing appliances. Make good and paint the affected wall surfaces.",
    lines: [
      { kind: "labour", description: "Strip out and dispose", qty: 8, unit: "hr", unitCost: 62, markupBp: 6000 },
      { kind: "labour", description: "Install carcasses, benchtop and fit off", qty: 26, unit: "hr", unitCost: 62, markupBp: 6000 },
      { kind: "material", description: "Flat pack kitchen — supply", qty: 1, unit: "lot", unitCost: 4_280 },
      { kind: "material", description: "Laminate benchtop, post-formed", qty: 5.4, unit: "lm", unitCost: 186 },
      { kind: "material", description: "Sink, mixer and connections", qty: 1, unit: "lot", unitCost: 540 },
      { kind: "subcontractor", description: "Plumber — disconnect and reconnect", qty: 0.5, unit: "day", unitCost: 920 },
      { kind: "subcontractor", description: "Electrician — GPOs and rangehood", qty: 0.5, unit: "day", unitCost: 880 },
      { kind: "subcontractor", description: "Painting — make good", qty: 22, unit: "m2", unitCost: 34 },
      { kind: "plant", description: "Skip bin", qty: 1, unit: "ea", unitCost: 430 },
    ],
  },
  {
    key: "nguyen", number: "Q-1081", title: "Two bedroom granny flat — 7 Bellevue Ave",
    client: "nguyen", site: "Home — Stafford", job: "nguyen_flat",
    status: "accepted", issued: -26, valid: 4, markupBp: 1800,
    accepted: { at: -4, by: "Hien Nguyen" },
    scope:
      "Detached 58m2 secondary dwelling: two bedrooms, bathroom, open plan kitchen and living, and a small covered deck. Slab on ground, timber frame, colorbond roof. Includes connection to the existing services and the council application.",
    exclusions:
      "Excludes: landscaping, driveway, fencing, window furnishings, and any headworks charges levied by council or Urban Utilities.",
    lines: [
      { kind: "other", description: "Design, drafting and engineering", qty: 1, unit: "ea", unitCost: 6_400, markupBp: 1000 },
      { kind: "other", description: "Building approval, certifier and council fees", qty: 1, unit: "ea", unitCost: 4_800, markupBp: 500 },
      { kind: "subcontractor", description: "Excavation and site preparation", qty: 3, unit: "day", unitCost: 1_150 },
      { kind: "material", description: "Slab — concrete, mesh and formwork", qty: 1, unit: "lot", unitCost: 11_600 },
      { kind: "labour", description: "Framing and roof structure", qty: 220, unit: "hr", unitCost: 62, markupBp: 5500 },
      { kind: "material", description: "Frame, trusses and roofing", qty: 1, unit: "lot", unitCost: 22_400 },
      { kind: "material", description: "Windows and external doors", qty: 1, unit: "lot", unitCost: 9_800 },
      { kind: "material", description: "Cladding, insulation and linings", qty: 1, unit: "lot", unitCost: 14_200 },
      { kind: "subcontractor", description: "Plumbing — rough in, fit off and connections", qty: 9, unit: "day", unitCost: 920 },
      { kind: "subcontractor", description: "Electrical — rough in, fit off and switchboard", qty: 7, unit: "day", unitCost: 880 },
      { kind: "subcontractor", description: "Plasterboard — hang and set", qty: 196, unit: "m2", unitCost: 46 },
      { kind: "subcontractor", description: "Tiling — bathroom and wet areas", qty: 34, unit: "m2", unitCost: 78 },
      { kind: "subcontractor", description: "Painting throughout", qty: 210, unit: "m2", unitCost: 34 },
      { kind: "material", description: "Kitchen, bathroom fixtures and fittings", qty: 1, unit: "lot", unitCost: 16_800 },
      { kind: "labour", description: "Fit out, fix and finishing carpentry", qty: 150, unit: "hr", unitCost: 62, markupBp: 5500 },
      { kind: "plant", description: "Skip bins and site amenities", qty: 1, unit: "lot", unitCost: 2_900 },
    ],
  },
  {
    key: "dental", number: "Q-1078", title: "Reception & waiting room fitout",
    client: "dental", site: "Surgery — Holland Park", job: "dental_fitout",
    status: "accepted", issued: -34, valid: -4, markupBp: 1500,
    accepted: { at: -14, by: "Dr Anita Sharma" },
    scope:
      "Strip out the existing reception counter and waiting room finishes. Install new custom reception joinery, suspended ceiling with LED panel lighting, commercial vinyl flooring, and repaint. All works between 5pm Friday and 7am Tuesday of the October long weekend.",
    exclusions: "Excludes: furniture, signage, IT and data cabling, and any works within the surgery rooms.",
    lines: [
      { kind: "labour", description: "Strip out (after hours)", qty: 14, unit: "hr", unitCost: 78, markupBp: 5000 },
      { kind: "material", description: "Custom reception joinery — supply", qty: 1, unit: "ea", unitCost: 9_800 },
      { kind: "labour", description: "Install joinery and carpentry", qty: 30, unit: "hr", unitCost: 62, markupBp: 5500 },
      { kind: "material", description: "Suspended ceiling grid and tiles", qty: 46, unit: "m2", unitCost: 58 },
      { kind: "subcontractor", description: "Electrical — LED panels, GPOs, isolation of medical gas zone", qty: 2, unit: "day", unitCost: 880 },
      { kind: "material", description: "Commercial vinyl flooring — supply", qty: 46, unit: "m2", unitCost: 62 },
      { kind: "subcontractor", description: "Flooring installation", qty: 46, unit: "m2", unitCost: 38 },
      { kind: "subcontractor", description: "Painting — reception and waiting room", qty: 118, unit: "m2", unitCost: 34 },
      { kind: "plant", description: "Skip bin and after-hours amenities", qty: 1, unit: "lot", unitCost: 980 },
    ],
  },
  {
    key: "raman_fence", number: "Q-1074", title: "Front fence & automated gate",
    client: "raman", site: "Home — Paddington", job: "raman_fence",
    status: "rejected", issued: -46, valid: -16, markupBp: 2500,
    rejected: { at: -14, reason: "Went with a fencing specialist, roughly 20% cheaper." },
    scope: "Hardwood picket fence to the street boundary with an automated sliding gate and intercom.",
    lines: [
      { kind: "labour", description: "Set out, dig and set posts", qty: 22, unit: "hr", unitCost: 62, markupBp: 6000 },
      { kind: "material", description: "Hardwood posts, rails and pickets", qty: 1, unit: "lot", unitCost: 3_900 },
      { kind: "material", description: "Sliding gate hardware and motor", qty: 1, unit: "ea", unitCost: 2_650 },
      { kind: "subcontractor", description: "Electrician — gate motor and intercom", qty: 1, unit: "day", unitCost: 880 },
      { kind: "labour", description: "Build and hang", qty: 28, unit: "hr", unitCost: 62, markupBp: 6000 },
    ],
  },
  {
    key: "bce", number: "Q-1088", title: "St Brendan's staff room refresh — budget estimate",
    client: "bce", site: "St Brendan's — staff room", job: "bce_staff",
    status: "draft", issued: 0, valid: 30, markupBp: 1500,
    scope:
      "Budget figure only, for capital works planning. New kitchenette, replacement ceiling grid and lighting, vinyl plank flooring, and repaint throughout. School holiday period.",
    lines: [
      { kind: "labour", description: "Strip out and preparation", qty: 20, unit: "hr", unitCost: 62, markupBp: 5500 },
      { kind: "material", description: "Kitchenette joinery and benchtop", qty: 1, unit: "lot", unitCost: 7_200 },
      { kind: "material", description: "Ceiling grid, tiles and LED panels", qty: 64, unit: "m2", unitCost: 74 },
      { kind: "material", description: "Vinyl plank flooring", qty: 64, unit: "m2", unitCost: 48 },
      { kind: "subcontractor", description: "Electrical", qty: 2, unit: "day", unitCost: 880 },
      { kind: "subcontractor", description: "Plumbing — kitchenette", qty: 1, unit: "day", unitCost: 920 },
      { kind: "subcontractor", description: "Painting", qty: 140, unit: "m2", unitCost: 34 },
      { kind: "labour", description: "Install and fit off", qty: 46, unit: "hr", unitCost: 62, markupBp: 5500 },
    ],
  },
  {
    key: "kilby_ext", number: "Q-1069", title: "Two-storey rear extension — 31 Waterworks Rd",
    client: "kilby", site: "Home — Ashgrove", job: "kilby_ext",
    status: "accepted", issued: -64, valid: -34, markupBp: 1800,
    accepted: { at: -46, by: "Megan Kilby" },
    scope:
      "Two-storey rear extension: 42m2 ground floor living and dining, 46m2 first floor with two bedrooms and a bathroom. New 6m LVL portal to the existing rear wall, piered footings to the fall of the site, colorbond roof to match.",
    exclusions:
      "Excludes: landscaping and retaining, driveway, floor coverings to the existing house, and any asbestos removal.",
    lines: [
      { kind: "other", description: "Drafting, engineering and building approval", qty: 1, unit: "lot", unitCost: 9_400, markupBp: 800 },
      { kind: "subcontractor", description: "Excavation, piering and footings", qty: 6, unit: "day", unitCost: 1_250 },
      { kind: "material", description: "Concrete, reo and formwork", qty: 1, unit: "lot", unitCost: 17_800 },
      { kind: "labour", description: "Framing — ground and first floor", qty: 420, unit: "hr", unitCost: 62, markupBp: 5500 },
      { kind: "material", description: "Frame, LVL portal, trusses", qty: 1, unit: "lot", unitCost: 31_600 },
      { kind: "material", description: "Roofing, gutters and flashings", qty: 1, unit: "lot", unitCost: 12_400 },
      { kind: "material", description: "Windows and external doors", qty: 1, unit: "lot", unitCost: 18_900 },
      { kind: "material", description: "Cladding, insulation, linings", qty: 1, unit: "lot", unitCost: 21_200 },
      { kind: "subcontractor", description: "Plumbing — rough in and fit off", qty: 14, unit: "day", unitCost: 920 },
      { kind: "subcontractor", description: "Electrical — rough in, fit off, board upgrade", qty: 12, unit: "day", unitCost: 880 },
      { kind: "subcontractor", description: "Plasterboard — hang and set", qty: 380, unit: "m2", unitCost: 46 },
      { kind: "subcontractor", description: "Tiling — bathroom and wet areas", qty: 48, unit: "m2", unitCost: 78 },
      { kind: "subcontractor", description: "Painting throughout", qty: 420, unit: "m2", unitCost: 34 },
      { kind: "labour", description: "Fix out and finishing carpentry", qty: 280, unit: "hr", unitCost: 62, markupBp: 5500 },
      { kind: "material", description: "Bathroom and kitchen fittings", qty: 1, unit: "lot", unitCost: 14_600 },
      { kind: "plant", description: "Scaffold, skips and site amenities", qty: 1, unit: "lot", unitCost: 8_200 },
    ],
  },
];

async function seedQuotes(ctx: Ctx) {
  for (const spec of QUOTE_SPECS) {
    const lines = costLines(spec.lines, spec.markupBp, GST_BP);
    const totals = sumLines(lines);

    const [quote] = await db
      .insert(quotes)
      .values({
        quoteNumber: spec.number,
        clientId: ctx.clients[spec.client]!,
        siteId: ctx.sites[spec.site]!,
        jobId: spec.job ? ctx.jobs[spec.job]! : null,
        title: spec.title,
        status: spec.status,
        issueDate: dayOffset(spec.issued),
        validUntil: dayOffset(spec.issued + spec.valid),
        globalMarkupBp: spec.markupBp,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        costTotalCents: totals.costTotalCents,
        scopeOfWork: spec.scope,
        exclusions: spec.exclusions ?? null,
        sentAt: spec.status === "draft" ? null : atTime(spec.issued, 16, 20),
        acceptedAt: spec.accepted ? atTime(spec.accepted.at, 10, 5) : null,
        acceptedByName: spec.accepted?.by ?? null,
        rejectedAt: spec.rejected ? atTime(spec.rejected.at, 14, 0) : null,
        rejectedReason: spec.rejected?.reason ?? null,
        createdBy: ctx.users.greg,
      })
      .returning({ id: quotes.id });

    ctx.quotes[spec.key] = quote!.id;

    await db.insert(quoteLines).values(
      lines.map((line, i) => ({
        quoteId: quote!.id,
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

    /*
     * Accepting a quote is what gives a job its budget. Each line's COST
     * (not its price) lands in the matching budget bucket, and the contract
     * value is the quoted price ex GST. This is the same maths the
     * "convert to job" button runs in src/modules/quotes/convert.ts, so the
     * demo data can't tell a different story from the app.
     */
    if (spec.status === "accepted" && spec.job) {
      const bucket = { labour: 0, material: 0, subcontractor: 0, plant: 0, other: 0 };
      for (const line of lines) bucket[line.kind] += line.lineCostCents;

      await db
        .update(jobs)
        .set({
          contractValueCents: totals.subtotalCents,
          budgetLabourCents: bucket.labour,
          budgetMaterialCents: bucket.material,
          budgetSubcontractorCents: bucket.subcontractor,
          budgetPlantCents: bucket.plant,
          budgetOtherCents: bucket.other,
          targetMarginBp: marginBp(totals.costTotalCents, totals.subtotalCents),
          sourceQuoteId: quote!.id,
        })
        .where(eq(jobs.id, ctx.jobs[spec.job]!));
    }
  }
}
