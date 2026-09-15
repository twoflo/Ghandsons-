# G. Hand & Sons — job and finance management

A job, money and paperwork system for a small residential building company.
Built to be used one-handed on a phone standing in a driveway, and on a laptop
at the kitchen table at 9pm.

Everything is in Australian dollars, GST is 10%, and the financial year runs
1 July to 30 June.

---

## Getting it running

You need Node 20 or newer and a Postgres 15+ database.

```bash
npm install
cp .env.example .env
npm run db:setup              # creates the tables, constraints, views and demo data
npm run dev
```

For the database, either:

- **Docker** — `docker compose up -d` before `db:setup`. The `DATABASE_URL`
  already in `.env.example` matches it, so there is nothing to edit.
- **A hosted Postgres** (Neon, Supabase, anything) — paste its connection
  string over `DATABASE_URL` in `.env`. No local install. Provider-specific
  query parameters that the driver can't use, such as Neon's
  `channel_binding`, are stripped automatically; `sslmode` is respected.
- **Postgres already on your machine** — point `DATABASE_URL` at it and make
  sure the database named in the URL exists.

The setup needs permission to `CREATE EXTENSION pg_trgm` (used for fuzzy
supplier matching on receipts). Neon, Supabase and a local superuser all allow
this; a locked-down managed instance may not.

Open http://localhost:3000 and sign in.

`db:setup` is three steps in one — `db:push` (tables), `db:sql` (check
constraints, partial unique indexes, the audit trigger and the reporting views)
and `db:seed` (the demo business). To wipe and start again, `npm run db:reset`.

### Demo logins

Password for all of them: **`buildit2026`**

| Email | Who | Role | What they can see |
|---|---|---|---|
| `greg@ghandsons.com.au` | Greg Hand | Owner | Everything, including settings and users |
| `donna@ghandsons.com.au` | Donna Hand | Office | Quotes, invoices, expenses, reports — no user management |
| `jake@ghandsons.com.au` | Jake Hand | Field | Own schedule, own timesheet, receipts, site photos |
| `marco@ghandsons.com.au` | Marco Ferraro | Field | Same as Jake |
| `tyler@ghandsons.com.au` | Tyler Nguyen | Field | Apprentice — same as Jake |
| `wes@kellyelectrical.com.au` | Wes Kelly | Field | Subcontractor electrician |
| `sam@northsideplumbing.com.au` | Sam Okafor | Field | Subcontractor plumber |

Sign in as Greg to see the whole system. Sign in as Jake on a phone-sized
window to see what a worker actually gets: today's job, a clock-in button and
the orange **Snap** button for receipts.

### Environment variables

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string. Required. |
| `AUTH_SESSION_DAYS` | `30` | How long a login lasts before you have to sign in again. |
| `STORAGE_DRIVER` | `local` | `local` writes to disk (development). `supabase` uses Supabase Storage (production). |
| `STORAGE_LOCAL_DIR` | `./public/uploads` | Where the local driver puts files. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` | — | Only read when `STORAGE_DRIVER=supabase`. |
| `OCR_PROVIDER` | `none` | `tesseract` runs local OCR before the model sees the image. Optional — the model reads the image directly either way. |
| `EXTRACTION_PROVIDER` | `mock` | `anthropic` calls the real model. `mock` returns a canned extraction so you can click through the flow without an API key. |
| `ANTHROPIC_API_KEY` | — | Needed when `EXTRACTION_PROVIDER=anthropic`. |
| `EXTRACTION_MODEL` | `claude-opus-5` | The model used to read receipts. |
| `DEFAULT_TIMEZONE` | `Australia/Brisbane` | Used for "today" on the dashboard and timesheets. |

The demo seeds with `EXTRACTION_PROVIDER=mock` so the app works out of the box.
Set a real key and switch to `anthropic` to photograph an actual docket.

---

## Receipt capture — the bit that matters

1. Tap **Snap** (the orange button, always in reach on a phone), take a photo or
   pick one from the camera roll. The image is compressed in the browser to
   1600px JPEG before it leaves the phone, so it goes up over patchy 4G.
2. The upload returns immediately and the extraction runs after the response.
   You can take the next photo straight away — bulk uploads land in a review
   queue rather than blocking you.
3. The model reads the image and returns supplier, ABN, date, subtotal, GST,
   total and line items, **each with its own confidence score**.
4. Deterministic checks run after the model: if subtotal + GST doesn't equal the
   total, all three are dropped to low confidence rather than silently trusted.
   A missing subtotal is derived; a missing GST on a plainly GST-inclusive total
   is taken as an eleventh, flagged as an assumption. Dates in the future or
   more than three years old are flagged.
5. Supplier, expense category and job are suggested from your own data — ABN
   exact match first, then a learned alias, then fuzzy name match; category from
   keywords; job from who was clocked on where that day. On a tie it suggests
   nothing rather than guessing.
6. You review it side by side with the photo. Anything the model was unsure of
   is highlighted in amber with the reason. Fix what's wrong, approve, and it
   becomes an expense against the job.
7. The original photo is kept forever, linked to the expense. Corrections train
   the supplier aliases, so the same docket is matched next time.

Nothing is posted to your books without a human pressing approve.

---

## What's in it

**Jobs** — the pipeline runs Lead → Quoted → Won → Scheduled → In Progress →
Complete → Invoiced → Paid. The job detail page is the hub: budget vs actual,
schedule, crew hours, quotes, invoices, expenses, POs, variations, documents,
photos and safety, all on tabs off the one job.

**Budget vs actual** — the panel shows spent, committed (POs raised, not yet
invoiced) and pending, and forecasts the margin at completion rather than
flattering you with a mid-job number.

**Clients** — multiple sites per client, contact history, outstanding balance.

**Quotes** — line items typed as labour, materials or subcontractor, markup per
line or across the whole quote, a reusable price book, PDF export, accept or
reject, and one click to turn an accepted quote into a job with its budget
already broken down by category.

**Scheduling** — week and month calendar, drag to move a booking, assign crew,
and double-bookings are flagged rather than silently allowed. Each worker gets a
plain day view on their phone.

**Timesheets** — clock in and out from a phone, or enter hours by hand if
someone forgot. Cost and charge-out rates per person. The week is approved by
the office, and approved labour lands in the job's actual cost.

**Invoices** — progress claims, deposits, part-payments, GST lines, PDF. Aged
receivables on the reports page.

**Expenses** — tagged to a job and a category, marked billable or not.

**Reports** — profit per job, profit by month, cash in vs out, aged receivables
and a July–June tax summary for the accountant. Every dataset exports to CSV
(opens straight in Excel, no mangled dates).

**Suppliers and POs** — raise a purchase order against a job, mark it received,
match the docket to the supplier's invoice.

**Variations** — cost and approval status; an approved variation raises the
revised budget and is offered on the next invoice.

**Compliance** — licence and insurance expiry with reminders, SWMS, incident
log.

**Settings** — business details and logo, tax rates, document numbering, email
templates, users and permissions, expense categories, price book.

---

## How it's built

Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Drizzle ORM over
Postgres. Deploys to Vercel with Supabase for Postgres and file storage.

Some decisions worth knowing about if you're picking this up:

- **Money is integer cents, everywhere.** Percentages are basis points. There
  are no floats in the money path. Rounding is half away from zero, done once,
  at the line.
- **Validation is server-side and layered.** Every server action goes through a
  zod schema; the database has check constraints behind that (an invoice's
  balance must equal total minus paid, a worker can only have one open time
  entry). Constraint violations are translated into plain English before they
  reach the screen.
- **Nothing is deleted.** Everything has `deleted_at`; delete is an archive.
- **Everything financial is audited.** An append-only `audit_log` with a
  database trigger that rejects updates and deletes of its own rows.
- **Derived money lives in Postgres views**, not in application code, so the
  dashboard, the job page and the reports can't disagree with each other.
- **Charts are hand-written inline SVG.** No chart library — it's a lot of
  JavaScript to ship to a phone on 4G for four bar charts. Each one has a
  table view underneath for screen readers and for anyone who'd rather read the
  numbers.

Run the tests with `npm test` (35 tests over the money arithmetic and the
receipt post-processing) and `npm run typecheck`.

---

## Assumptions made

The brief left a few blanks. These are filled in in the demo data and are easy
to change:

- **Trade:** residential renovations and extensions.
- **Location:** Brisbane, Queensland.
- **Size:** 5 staff (owner, office manager, two carpenters, one apprentice) plus
  2 regular subcontractors (electrician, plumber), running about 8 jobs at once.

## Still open

Worth deciding before this goes live:

- **Accounting integration.** Nothing talks to Xero or MYOB yet. The CSV export
  is built for hand-off to an accountant; a real sync is a separate piece of
  work.
- **Outbound email.** Quotes and invoices generate PDFs and there are editable
  email templates in settings, but nothing sends mail — you download and attach.
  Wiring up a provider is a small job once you've picked one.
- **Subcontractor logins.** Wes and Sam currently have Field logins and can
  clock on. If you'd rather subbies invoice you rather than timesheet, their
  accounts should come out.
