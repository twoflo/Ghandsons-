import { config as loadEnv } from "../../lib/env-file";
loadEnv();

import { seedReference } from "./01-reference";
import { seedPeople, DEMO_PASSWORD, PEOPLE } from "./02-people";
import { seedClients } from "./03-clients";
import { seedJobs } from "./04-jobs";
import { seedOperations } from "./05-operations";
import { seedMoney } from "./06-money";
import { seedSite } from "./07-site";
import type { Ctx } from "./context";

const ctx: Ctx = {
  gstRateId: "", gstFreeRateId: "",
  users: {}, jobTypes: {}, categories: {}, priceBook: {},
  clients: {}, contacts: {}, sites: {}, suppliers: {},
  jobs: {}, quotes: {}, invoices: {}, logoFileId: null,
};

const steps: Array<[string, (c: Ctx) => Promise<void>]> = [
  ["settings, tax, price book", seedReference],
  ["crew and logins", seedPeople],
  ["clients, sites and suppliers", seedClients],
  ["jobs and quotes", seedJobs],
  ["schedule and timesheets", seedOperations],
  ["expenses, receipts, invoices, POs, variations", seedMoney],
  ["photos, documents, compliance, audit trail", seedSite],
];

console.log("\nSeeding G. Hand & Sons demo data\n");

for (const [label, run] of steps) {
  const started = Date.now();
  process.stdout.write(`  ${label} … `);
  await run(ctx);
  console.log(`done (${Date.now() - started}ms)`);
}

console.log(`
Done.

  Sign in at http://localhost:3000/login

  Password for every demo account: ${DEMO_PASSWORD}

${PEOPLE.map((p) => `    ${p.email.padEnd(36)} ${p.role}`).join("\n")}

  Start as greg@ghandsons.com.au to see everything.
`);

process.exit(0);
