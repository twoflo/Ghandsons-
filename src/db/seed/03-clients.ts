import { db } from "../index";
import { clients, contacts, sites, interactions, suppliers, supplierAliases } from "../schema";
import type { Ctx } from "./context";
import { atTime } from "./context";

export async function seedClients(ctx: Ctx) {
  const clientRows = await db
    .insert(clients)
    .values([
      {
        name: "Sarah & Tom Whitfield", type: "individual", email: "sarah.whitfield@gmail.com",
        phone: "0403 118 277", addressLine1: "14 Jubilee Terrace", suburb: "Bardon", state: "QLD",
        postcode: "4065", paymentTermsDays: 14, source: "referral",
        notes: "Repeat clients — did their deck in 2023. Sarah handles the decisions, Tom pays the bills. Prefers a text over a call.",
        createdBy: ctx.users.greg,
      },
      {
        name: "Priya Raman", type: "individual", email: "priya.raman@outlook.com",
        phone: "0431 662 019", addressLine1: "9 Latrobe Street", suburb: "Paddington", state: "QLD",
        postcode: "4064", paymentTermsDays: 14, source: "web",
        notes: "Architect. Knows exactly what she wants and reads every line of a quote. Pays fast.",
        createdBy: ctx.users.greg,
      },
      {
        name: "Coorparoo Property Group Pty Ltd", type: "company", abn: "63 142 887 509",
        email: "accounts@coorparoopg.com.au", phone: "(07) 3397 4412",
        addressLine1: "Level 2, 210 Old Cleveland Road", suburb: "Coorparoo", state: "QLD",
        postcode: "4151", paymentTermsDays: 30, source: "repeat",
        notes: "Four unit blocks around Coorparoo and Camp Hill. Steady refurb work. Strict 30 day terms and they do use them.",
        createdBy: ctx.users.greg,
      },
      {
        name: "Dave & Megan Kilby", type: "individual", email: "meg.kilby@bigpond.com",
        phone: "0402 774 156", addressLine1: "31 Waterworks Road", suburb: "Ashgrove", state: "QLD",
        postcode: "4060", paymentTermsDays: 14, source: "signage",
        notes: "Big extension, living on site through it. Keep them across everything — they worry.",
        createdBy: ctx.users.greg,
      },
      {
        name: "Holland Park Dental", type: "company", abn: "29 611 453 288",
        email: "practice@hollandparkdental.com.au", phone: "(07) 3847 2200",
        addressLine1: "122 Logan Road", suburb: "Holland Park", state: "QLD", postcode: "4121",
        paymentTermsDays: 21, source: "referral",
        notes: "Fitout has to happen over a long weekend — surgery can't close on a weekday.",
        createdBy: ctx.users.donna,
      },
      {
        name: "Nguyen Family Trust", type: "company", abn: "55 298 116 740",
        email: "hien.nguyen@gmail.com", phone: "0455 209 388",
        addressLine1: "7 Bellevue Avenue", suburb: "Stafford", state: "QLD", postcode: "4053",
        paymentTermsDays: 14, source: "referral",
        notes: "Granny flat for Hien's parents. Budget conscious, decisions take a week.",
        createdBy: ctx.users.greg,
      },
      {
        name: "Ray Osborne", type: "individual", email: "rayosborne54@gmail.com",
        phone: "0418 003 921", addressLine1: "62 Sandringham Street", suburb: "Camp Hill",
        state: "QLD", postcode: "4152", paymentTermsDays: 7, source: "signage",
        notes: "Retired. Cash flow matters to him, so keep the claims small and regular.",
        createdBy: ctx.users.greg,
      },
      {
        name: "Brisbane Catholic Education", type: "company", abn: "80 432 611 097",
        email: "facilities@bne.catholic.edu.au", phone: "(07) 3033 7000",
        addressLine1: "243 Gladstone Road", suburb: "Dutton Park", state: "QLD", postcode: "4102",
        paymentTermsDays: 30, source: "web",
        notes: "Purchase order required before any work. No PO, no payment — learned that one the hard way.",
        createdBy: ctx.users.donna,
      },
    ])
    .returning({ id: clients.id, name: clients.name });

  const byName = (n: string) => clientRows.find((c) => c.name === n)!.id;
  ctx.clients = {
    whitfield: byName("Sarah & Tom Whitfield"),
    raman: byName("Priya Raman"),
    cpg: byName("Coorparoo Property Group Pty Ltd"),
    kilby: byName("Dave & Megan Kilby"),
    dental: byName("Holland Park Dental"),
    nguyen: byName("Nguyen Family Trust"),
    osborne: byName("Ray Osborne"),
    bce: byName("Brisbane Catholic Education"),
  };

  const contactRows = await db
    .insert(contacts)
    .values([
      { clientId: ctx.clients.whitfield!, name: "Sarah Whitfield", role: "Decision maker", email: "sarah.whitfield@gmail.com", phone: "0403 118 277", isPrimary: true },
      { clientId: ctx.clients.whitfield!, name: "Tom Whitfield", role: "Accounts", email: "tom.whitfield@gmail.com", phone: "0403 118 288" },
      { clientId: ctx.clients.cpg!, name: "Angela Pertile", role: "Property manager", email: "angela@coorparoopg.com.au", phone: "0407 118 442", isPrimary: true },
      { clientId: ctx.clients.cpg!, name: "Accounts payable", role: "Accounts", email: "accounts@coorparoopg.com.au", phone: "(07) 3397 4412" },
      { clientId: ctx.clients.kilby!, name: "Megan Kilby", role: "Decision maker", email: "meg.kilby@bigpond.com", phone: "0402 774 156", isPrimary: true },
      { clientId: ctx.clients.dental!, name: "Dr Anita Sharma", role: "Principal dentist", email: "anita@hollandparkdental.com.au", phone: "0422 118 776", isPrimary: true },
      { clientId: ctx.clients.nguyen!, name: "Hien Nguyen", role: "Trustee", email: "hien.nguyen@gmail.com", phone: "0455 209 388", isPrimary: true },
      { clientId: ctx.clients.bce!, name: "Paul Mensah", role: "Facilities coordinator", email: "paul.mensah@bne.catholic.edu.au", phone: "0407 663 118", isPrimary: true },
    ])
    .returning({ id: contacts.id, name: contacts.name });
  for (const c of contactRows) ctx.contacts[c.name] = c.id;

  const siteRows = await db
    .insert(sites)
    .values([
      { clientId: ctx.clients.whitfield!, label: "Home — Bardon", addressLine1: "14 Jubilee Terrace", suburb: "Bardon", state: "QLD", postcode: "4065", latitude: "-27.4592", longitude: "152.9814", accessNotes: "Key under the pot by the back stairs. Dog (Bindi) is friendly but bolts — shut the side gate.", parkingNotes: "Driveway fits two utes. Don't block the neighbour at no.16." },
      { clientId: ctx.clients.raman!, label: "Home — Paddington", addressLine1: "9 Latrobe Street", suburb: "Paddington", state: "QLD", postcode: "4064", latitude: "-27.4603", longitude: "153.0009", accessNotes: "Priya works from home, just knock.", parkingNotes: "Two hour street parking — move the ute at 11 or you'll get a ticket." },
      { clientId: ctx.clients.cpg!, label: "Marlow Court — Unit 3", addressLine1: "3/48 Marlow Street", suburb: "Coorparoo", state: "QLD", postcode: "4151", latitude: "-27.4948", longitude: "153.0620", accessNotes: "Angela drops the key at the letterbox by 7am. Body corporate: no noisy work before 7:30 or after 4.", hazardNotes: "Asbestos register on file — 1970s block. Do not cut the eaves sheeting." },
      { clientId: ctx.clients.cpg!, label: "Marlow Court — Unit 7", addressLine1: "7/48 Marlow Street", suburb: "Coorparoo", state: "QLD", postcode: "4151", latitude: "-27.4948", longitude: "153.0620", accessNotes: "Tenant vacates 2 October. Nothing before then." },
      { clientId: ctx.clients.kilby!, label: "Home — Ashgrove", addressLine1: "31 Waterworks Road", suburb: "Ashgrove", state: "QLD", postcode: "4060", latitude: "-27.4436", longitude: "152.9930", accessNotes: "Family living on site. Toilet and kitchen must be usable every night.", parkingNotes: "Waterworks Rd is clearway 7-9am. Park in the yard.", hazardNotes: "Steep site. Fall protection required on the rear elevation above 2m." },
      { clientId: ctx.clients.dental!, label: "Surgery — Holland Park", addressLine1: "122 Logan Road", suburb: "Holland Park", state: "QLD", postcode: "4121", latitude: "-27.5185", longitude: "153.0620", accessNotes: "After hours only. Alarm code from Anita — do not write it down on site.", hazardNotes: "Live medical gas lines in the ceiling space. Isolate before any ceiling work." },
      { clientId: ctx.clients.nguyen!, label: "Home — Stafford", addressLine1: "7 Bellevue Avenue", suburb: "Stafford", state: "QLD", postcode: "4053", latitude: "-27.4088", longitude: "153.0159", accessNotes: "Rear yard access via the laneway off Ellison Rd." },
      { clientId: ctx.clients.osborne!, label: "Home — Camp Hill", addressLine1: "62 Sandringham Street", suburb: "Camp Hill", state: "QLD", postcode: "4152", latitude: "-27.4948", longitude: "153.0713", accessNotes: "Ray is home most days. Ring the bell, he's a bit deaf." },
      { clientId: ctx.clients.bce!, label: "St Brendan's — staff room", addressLine1: "56 Turner Road", suburb: "Moorooka", state: "QLD", postcode: "4105", latitude: "-27.5310", longitude: "153.0250", accessNotes: "School holidays only. Blue card required for every person on site." },
    ])
    .returning({ id: sites.id, label: sites.label });
  for (const s of siteRows) ctx.sites[s.label] = s.id;

  /* ------------------------------- suppliers -------------------------------- */
  const supplierRows = await db
    .insert(suppliers)
    .values([
      { name: "Bunnings Trade Newmarket", abn: "26 008 672 179", phone: "(07) 3552 8000", addressLine1: "114 Enoggera Road", suburb: "Newmarket", state: "QLD", postcode: "4051", accountNumber: "TRD-448210", paymentTermsDays: 30, defaultCategoryId: ctx.categories["Hardware & fixings"]!, contactName: "Trade desk" },
      { name: "Dahlsens Building Centre", abn: "45 004 253 111", phone: "(07) 3265 4400", addressLine1: "22 Zillmere Road", suburb: "Boondall", state: "QLD", postcode: "4034", accountNumber: "GHS-1182", paymentTermsDays: 30, defaultCategoryId: ctx.categories["Timber & framing"]!, contactName: "Rick Dawson" },
      { name: "Reece Plumbing Newmarket", abn: "84 004 097 090", phone: "(07) 3356 1120", addressLine1: "80 Enoggera Road", suburb: "Newmarket", state: "QLD", postcode: "4051", accountNumber: "R-99341", paymentTermsDays: 30, defaultCategoryId: ctx.categories["Plumbing supplies"]! },
      { name: "Beaumont Tiles Windsor", abn: "38 007 890 234", phone: "(07) 3357 8800", addressLine1: "240 Lutwyche Road", suburb: "Windsor", state: "QLD", postcode: "4030", paymentTermsDays: 14, defaultCategoryId: ctx.categories["Tiles & waterproofing"]! },
      { name: "Boral Concrete Geebung", abn: "13 008 421 761", phone: "(07) 3865 2200", addressLine1: "412 Newman Road", suburb: "Geebung", state: "QLD", postcode: "4034", accountNumber: "BOR-77213", paymentTermsDays: 30, defaultCategoryId: ctx.categories["Concrete & steel"]! },
      { name: "Kennards Hire Newmarket", abn: "60 000 013 300", phone: "(07) 3357 9900", addressLine1: "168 Enoggera Road", suburb: "Newmarket", state: "QLD", postcode: "4051", paymentTermsDays: 14, defaultCategoryId: ctx.categories["Plant & equipment hire"]! },
      { name: "Kelly Electrical", abn: "71 604 338 210", email: "wes@kellyelectrical.com.au", phone: "0407 551 928", paymentTermsDays: 14, defaultCategoryId: ctx.categories.Subcontractor!, contactName: "Wes Kelly" },
      { name: "Northside Plumbing Co", abn: "88 155 902 771", email: "sam@northsideplumbing.com.au", phone: "0433 812 447", paymentTermsDays: 14, defaultCategoryId: ctx.categories.Subcontractor!, contactName: "Sam Okafor" },
      { name: "Tilecraft QLD", abn: "19 337 210 664", email: "jobs@tilecraftqld.com.au", phone: "0422 887 190", paymentTermsDays: 14, defaultCategoryId: ctx.categories.Subcontractor!, contactName: "Dimi Stavros" },
      { name: "Handy Skips Brisbane", abn: "51 622 009 118", phone: "1300 556 227", paymentTermsDays: 7, defaultCategoryId: ctx.categories["Skip bins & waste"]! },
      { name: "Ampol Newmarket", abn: "17 000 032 128", addressLine1: "96 Enoggera Road", suburb: "Newmarket", state: "QLD", postcode: "4051", paymentTermsDays: 30, defaultCategoryId: ctx.categories["Fuel & vehicle"]! },
      { name: "Middys Electrical Newstead", abn: "63 004 218 776", phone: "(07) 3257 4400", addressLine1: "18 Longland Street", suburb: "Newstead", state: "QLD", postcode: "4006", paymentTermsDays: 30, defaultCategoryId: ctx.categories["Electrical supplies"]! },
    ])
    .returning({ id: suppliers.id, name: suppliers.name });
  for (const s of supplierRows) ctx.suppliers[s.name] = s.id;

  // How these names actually print on a docket.
  await db.insert(supplierAliases).values([
    { supplierId: ctx.suppliers["Bunnings Trade Newmarket"]!, alias: "BUNNINGS GROUP LIMITED" },
    { supplierId: ctx.suppliers["Bunnings Trade Newmarket"]!, alias: "BUNNINGS WHSE NEWMARKET" },
    { supplierId: ctx.suppliers["Bunnings Trade Newmarket"]!, alias: "BUNNINGS TRADE 4051" },
    { supplierId: ctx.suppliers["Dahlsens Building Centre"]!, alias: "DAHLSENS BOONDALL" },
    { supplierId: ctx.suppliers["Reece Plumbing Newmarket"]!, alias: "REECE PTY LTD 9341" },
    { supplierId: ctx.suppliers["Beaumont Tiles Windsor"]!, alias: "BEAUMONT TILES WINDSOR" },
    { supplierId: ctx.suppliers["Boral Concrete Geebung"]!, alias: "BORAL RESOURCES QLD" },
    { supplierId: ctx.suppliers["Kennards Hire Newmarket"]!, alias: "KENNARDS HIRE PTY LTD" },
    { supplierId: ctx.suppliers["Ampol Newmarket"]!, alias: "AMPOL FOODARY NEWMARKET" },
    { supplierId: ctx.suppliers["Handy Skips Brisbane"]!, alias: "HANDY SKIPS BNE" },
  ]);

  /* ----------------------------- contact history ----------------------------- */
  await db.insert(interactions).values([
    { clientId: ctx.clients.kilby!, contactId: ctx.contacts["Megan Kilby"], kind: "site_visit", occurredAt: atTime(-3, 7, 30), summary: "Walked the first floor framing with Megan", detail: "She's happy with the layout. Asked about moving the linen cupboard 300mm — told her that's a variation, she said price it up.", userId: ctx.users.greg },
    { clientId: ctx.clients.kilby!, contactId: ctx.contacts["Megan Kilby"], kind: "call", occurredAt: atTime(-1, 17, 10), summary: "Called about the rain delay", detail: "Two days lost last week. Pushed the roof to the 22nd. She was fine about it.", userId: ctx.users.greg },
    { clientId: ctx.clients.whitfield!, contactId: ctx.contacts["Sarah Whitfield"], kind: "email", occurredAt: atTime(-21, 9, 5), summary: "Sent final invoice for the kitchen", userId: ctx.users.donna },
    { clientId: ctx.clients.whitfield!, contactId: ctx.contacts["Sarah Whitfield"], kind: "sms", occurredAt: atTime(-9, 12, 40), summary: "Sarah asked about a cracked tile in the ensuite", detail: "Booked in as a small maintenance job. Probably a movement crack, not our tiling.", userId: ctx.users.greg },
    { clientId: ctx.clients.osborne!, kind: "call", occurredAt: atTime(-5, 8, 15), summary: "Ray chasing the bathroom quote", detail: "Promised it by Friday. He's also getting a price from someone in Carina.", followUpOn: "", userId: ctx.users.greg },
    { clientId: ctx.clients.cpg!, contactId: ctx.contacts["Angela Pertile"], kind: "email", occurredAt: atTime(-11, 10, 22), summary: "Angela approved the Unit 3 bathroom scope", userId: ctx.users.donna },
    { clientId: ctx.clients.cpg!, contactId: ctx.contacts["Accounts payable"], kind: "email", occurredAt: atTime(-2, 15, 45), summary: "Chased INV-2065 — 38 days out", detail: "They say it's in the next payment run. Third time we've heard that.", userId: ctx.users.donna },
    { clientId: ctx.clients.dental!, contactId: ctx.contacts["Dr Anita Sharma"], kind: "meeting", occurredAt: atTime(-7, 18, 30), summary: "Confirmed the October long weekend for the fitout", detail: "Friday 5pm start, must be operational Tuesday 7am. No exceptions — they've booked patients.", userId: ctx.users.greg },
    { clientId: ctx.clients.nguyen!, contactId: ctx.contacts["Hien Nguyen"], kind: "call", occurredAt: atTime(-4, 16, 0), summary: "Hien accepted the granny flat quote verbally", detail: "Wants to start after the council approval comes through. Deposit invoice to follow.", userId: ctx.users.greg },
    { clientId: ctx.clients.bce!, contactId: ctx.contacts["Paul Mensah"], kind: "email", occurredAt: atTime(-6, 11, 12), summary: "Paul asked for a budget figure for the staff room", detail: "Needs a number for their capital works submission by the end of the month. Not a firm quote yet.", userId: ctx.users.donna },
    { clientId: ctx.clients.raman!, kind: "note", occurredAt: atTime(-14, 13, 0), summary: "Priya didn't go ahead with the front fence", detail: "Went with a fencing specialist — about 20% under us. Fair enough, not really our work.", userId: ctx.users.greg },
  ]);
}
