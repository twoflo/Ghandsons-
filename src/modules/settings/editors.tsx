"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveNumbering, saveTaxRate, saveExpenseCategory, saveJobType,
  savePriceBookItem, saveUser, saveEmailTemplate,
} from "./actions";
import { Button, Field, Input, MoneyInput, Select, Textarea, Alert, Card, CardHeader, Badge } from "@/components/ui";
import { formatMoney, formatBp, centsToInput } from "@/lib/money";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type Role } from "@/lib/permissions";
import { LINE_KIND } from "@/lib/status";

function useSave() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setNotice(result.message ?? "Saved.");
        after?.();
        router.refresh();
      } else {
        setError(result.message ?? "That didn't work.");
      }
    });
  }

  return { pending, error, notice, run };
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (!error && !notice) return null;
  return (
    <div className="mb-4">
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {notice ? <Alert tone="good">{notice}</Alert> : null}
    </div>
  );
}

/* -------------------------------- numbering ------------------------------- */

const SEQUENCE_LABELS: Record<string, string> = {
  job: "Jobs",
  quote: "Quotes",
  invoice: "Invoices",
  purchase_order: "Purchase orders",
  variation: "Variations",
  expense: "Expenses",
  incident: "Incidents",
};

export function NumberingEditor({
  sequences,
}: {
  sequences: Array<{ key: string; prefix: string; nextValue: number; padding: number }>;
}) {
  const { pending, error, notice, run } = useSave();

  return (
    <Card>
      <CardHeader
        title="Document numbering"
        subtitle="You can move a number forward but never back — a reused invoice number is a problem at audit time."
      />
      <div className="p-4">
        <Feedback error={error} notice={notice} />
        <ul className="space-y-4">
          {sequences.map((sequence) => (
            <li key={sequence.key}>
              <form
                className="grid items-end gap-3 sm:grid-cols-[1fr_6rem_8rem_5rem_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  run(() =>
                    saveNumbering({
                      key: sequence.key,
                      prefix: data.get("prefix"),
                      nextValue: data.get("nextValue"),
                      padding: data.get("padding"),
                    }),
                  );
                }}
              >
                <p className="font-bold text-ink-900">{SEQUENCE_LABELS[sequence.key] ?? sequence.key}</p>
                <Field label="Prefix" htmlFor={`prefix-${sequence.key}`}>
                  <Input id={`prefix-${sequence.key}`} name="prefix" defaultValue={sequence.prefix} maxLength={10} />
                </Field>
                <Field label="Next number" htmlFor={`next-${sequence.key}`}>
                  <Input
                    id={`next-${sequence.key}`}
                    name="nextValue"
                    type="number"
                    min={1}
                    defaultValue={sequence.nextValue}
                    className="tabular text-right"
                  />
                </Field>
                <Field label="Digits" htmlFor={`pad-${sequence.key}`}>
                  <Input
                    id={`pad-${sequence.key}`}
                    name="padding"
                    type="number"
                    min={0}
                    max={8}
                    defaultValue={sequence.padding}
                    className="tabular text-right"
                  />
                </Field>
                <Button type="submit" variant="secondary" disabled={pending}>Save</Button>
                <p className="text-sm text-ink-500 sm:col-span-5">
                  Next one out will be{" "}
                  <strong className="font-mono">
                    {sequence.prefix}
                    {String(sequence.nextValue).padStart(sequence.padding, "0")}
                  </strong>
                </p>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/* -------------------------------- tax rates ------------------------------- */

export function TaxRateEditor({
  rates,
}: {
  rates: Array<{ id: string; name: string; code: string; rateBp: number; isDefault: boolean; isActive: boolean }>;
}) {
  const { pending, error, notice, run } = useSave();
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader
        title="Tax rates"
        subtitle="GST is 10% in Australia. A second rate at 0% covers the odd GST-free line."
        action={!adding ? <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>+ Add</Button> : undefined}
      />
      <div className="p-4">
        <Feedback error={error} notice={notice} />

        {adding ? (
          <form
            className="mb-4 grid items-end gap-3 rounded-lg bg-ink-50 p-3 sm:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(
                () =>
                  saveTaxRate({
                    name: data.get("name"),
                    code: data.get("code"),
                    rateBp: Math.round((Number.parseFloat(String(data.get("pct"))) || 0) * 100),
                    isDefault: data.get("isDefault") === "on",
                  }),
                () => setAdding(false),
              );
            }}
          >
            <Field label="Name" htmlFor="trname" required>
              <Input id="trname" name="name" placeholder="GST 10%" required autoFocus />
            </Field>
            <Field label="Code" htmlFor="trcode" required>
              <Input id="trcode" name="code" placeholder="GST" required maxLength={10} />
            </Field>
            <Field label="Rate %" htmlFor="trpct" required>
              <Input id="trpct" name="pct" type="number" step="0.01" min={0} max={100} defaultValue="10" className="tabular text-right" />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setAdding(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>Add</Button>
            </div>
          </form>
        ) : null}

        <ul className="divide-y divide-ink-200">
          {rates.map((rate) => (
            <li key={rate.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold text-ink-900">
                  {rate.name} {rate.isDefault ? <Badge tone="brand" className="ml-1">Default</Badge> : null}
                </p>
                <p className="text-sm text-ink-600">
                  {rate.code} · {formatBp(rate.rateBp)}
                </p>
              </div>
              {!rate.isDefault ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      saveTaxRate({
                        id: rate.id,
                        name: rate.name,
                        code: rate.code,
                        rateBp: rate.rateBp,
                        isDefault: true,
                      }),
                    )
                  }
                >
                  Make default
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/* ------------------------------- categories ------------------------------- */

export function CategoryEditor({
  categories,
  jobTypes,
}: {
  categories: Array<{
    id: string; name: string; kind: string; defaultBillable: boolean;
    gstApplicable: boolean; matchKeywords: string[]; isActive: boolean;
  }>;
  jobTypes: Array<{ id: string; name: string; colour: string; defaultMarkupBp: number; isActive: boolean }>;
}) {
  const { pending, error, notice, run } = useSave();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [typeEditing, setTypeEditing] = useState<string | "new" | null>(null);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Expense categories"
          subtitle="The keywords are what the receipt reader matches against, so add the words that actually appear on your dockets."
          action={
            editing !== "new" ? (
              <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>+ Add</Button>
            ) : undefined
          }
        />
        <div className="p-4">
          <Feedback error={error} notice={notice} />

          {editing === "new" ? (
            <CategoryFields
              pending={pending}
              onCancel={() => setEditing(null)}
              onSubmit={(data) => run(() => saveExpenseCategory(data), () => setEditing(null))}
            />
          ) : null}

          <ul className="divide-y divide-ink-200">
            {categories.map((category) =>
              editing === category.id ? (
                <li key={category.id} className="py-3">
                  <CategoryFields
                    category={category}
                    pending={pending}
                    onCancel={() => setEditing(null)}
                    onSubmit={(data) =>
                      run(() => saveExpenseCategory({ ...data, id: category.id }), () => setEditing(null))
                    }
                  />
                </li>
              ) : (
                <li key={category.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">
                      {category.name}
                      {!category.isActive ? <Badge className="ml-2">Off</Badge> : null}
                    </p>
                    <p className="text-sm text-ink-600">
                      {LINE_KIND[category.kind]?.label ?? category.kind} ·{" "}
                      {category.defaultBillable ? "billable by default" : "not billable"}
                    </p>
                    {category.matchKeywords.length > 0 ? (
                      <p className="mt-0.5 font-mono text-xs text-ink-500">
                        {category.matchKeywords.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(category.id)}>Edit</Button>
                </li>
              ),
            )}
          </ul>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Job types"
          subtitle="Colour the calendar and set the markup a quote starts at."
          action={
            typeEditing !== "new" ? (
              <Button size="sm" variant="secondary" onClick={() => setTypeEditing("new")}>+ Add</Button>
            ) : undefined
          }
        />
        <div className="p-4">
          {typeEditing === "new" ? (
            <JobTypeFields
              pending={pending}
              onCancel={() => setTypeEditing(null)}
              onSubmit={(data) => run(() => saveJobType(data), () => setTypeEditing(null))}
            />
          ) : null}
          <ul className="divide-y divide-ink-200">
            {jobTypes.map((type) =>
              typeEditing === type.id ? (
                <li key={type.id} className="py-3">
                  <JobTypeFields
                    jobType={type}
                    pending={pending}
                    onCancel={() => setTypeEditing(null)}
                    onSubmit={(data) => run(() => saveJobType({ ...data, id: type.id }), () => setTypeEditing(null))}
                  />
                </li>
              ) : (
                <li key={type.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 rounded"
                      style={{ background: type.colour }}
                      aria-hidden="true"
                    />
                    <span className="font-semibold text-ink-900">{type.name}</span>
                    <span className="text-sm text-ink-500">{formatBp(type.defaultMarkupBp)} markup</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setTypeEditing(type.id)}>Edit</Button>
                </li>
              ),
            )}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function CategoryFields({
  category, pending, onCancel, onSubmit,
}: {
  category?: { name: string; kind: string; defaultBillable: boolean; gstApplicable: boolean; matchKeywords: string[]; isActive: boolean };
  pending: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="mb-4 grid gap-3 rounded-lg bg-ink-50 p-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          name: data.get("name"),
          kind: data.get("kind"),
          defaultBillable: data.get("defaultBillable") === "on",
          gstApplicable: data.get("gstApplicable") === "on",
          matchKeywords: data.get("matchKeywords"),
          isActive: data.get("isActive") === "on",
        });
      }}
    >
      <Field label="Name" htmlFor="catname" required>
        <Input id="catname" name="name" defaultValue={category?.name} required autoFocus />
      </Field>
      <Field label="Counts as" htmlFor="catkind" hint="Decides which budget bucket it hits on a job.">
        <Select id="catkind" name="kind" defaultValue={category?.kind ?? "material"}>
          {["labour", "material", "subcontractor", "plant", "other"].map((kind) => (
            <option key={kind} value={kind}>{LINE_KIND[kind]?.label ?? kind}</option>
          ))}
        </Select>
      </Field>
      <Field label="Words to match on a receipt" htmlFor="catkeys" className="sm:col-span-2"
             hint="Comma separated, lowercase. bunnings, screws, bracket…">
        <Input id="catkeys" name="matchKeywords" defaultValue={category?.matchKeywords.join(", ") ?? ""} />
      </Field>
      <label className="flex min-h-[var(--tap)] items-center gap-2 font-semibold text-ink-800">
        <input type="checkbox" name="defaultBillable" defaultChecked={category?.defaultBillable ?? true}
               className="h-5 w-5 rounded border-2 border-ink-400" />
        Billable to the client by default
      </label>
      <label className="flex min-h-[var(--tap)] items-center gap-2 font-semibold text-ink-800">
        <input type="checkbox" name="isActive" defaultChecked={category?.isActive ?? true}
               className="h-5 w-5 rounded border-2 border-ink-400" />
        In use
      </label>
      <input type="hidden" name="gstApplicable" value="on" />
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={pending}>Save</Button>
      </div>
    </form>
  );
}

function JobTypeFields({
  jobType, pending, onCancel, onSubmit,
}: {
  jobType?: { name: string; colour: string; defaultMarkupBp: number; isActive: boolean };
  pending: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="mb-4 grid items-end gap-3 rounded-lg bg-ink-50 p-3 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          name: data.get("name"),
          colour: data.get("colour"),
          defaultMarkupBp: Math.round((Number.parseFloat(String(data.get("pct"))) || 0) * 100),
          isActive: data.get("isActive") === "on",
        });
      }}
    >
      <Field label="Name" htmlFor="jtname" required className="sm:col-span-2">
        <Input id="jtname" name="name" defaultValue={jobType?.name} required autoFocus />
      </Field>
      <Field label="Colour" htmlFor="jtcolour">
        <Input id="jtcolour" name="colour" type="color" defaultValue={jobType?.colour ?? "#64748b"} className="!p-1" />
      </Field>
      <Field label="Markup %" htmlFor="jtpct">
        <Input id="jtpct" name="pct" type="number" step="0.5" min={0}
               defaultValue={(jobType?.defaultMarkupBp ?? 2000) / 100} className="tabular text-right" />
      </Field>
      <label className="flex min-h-[var(--tap)] items-center gap-2 font-semibold text-ink-800 sm:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked={jobType?.isActive ?? true}
               className="h-5 w-5 rounded border-2 border-ink-400" />
        In use
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={pending}>Save</Button>
      </div>
    </form>
  );
}

/* ------------------------------- price book ------------------------------- */

export function PriceBookEditor({
  items,
  taxRates,
}: {
  items: Array<{
    id: string; code: string; name: string; kind: string; unit: string;
    unitCostCents: number; defaultMarkupBp: number; isActive: boolean; taxRateId: string | null;
  }>;
  taxRates: Array<{ id: string; name: string }>;
}) {
  const { pending, error, notice, run } = useSave();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [search, setSearch] = useState("");

  const filtered = items.filter(
    (item) =>
      !search.trim() ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Card>
      <CardHeader
        title="Price book"
        subtitle="What things cost you. Quotes pull from here so you're not guessing at rates."
        action={
          editing !== "new" ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>+ Add</Button>
          ) : undefined
        }
      />
      <div className="p-4">
        <Feedback error={error} notice={notice} />

        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the price book…"
          aria-label="Search the price book"
          className="mb-4"
        />

        {editing === "new" ? (
          <PriceBookFields
            taxRates={taxRates}
            pending={pending}
            onCancel={() => setEditing(null)}
            onSubmit={(data) => run(() => savePriceBookItem(data), () => setEditing(null))}
          />
        ) : null}

        <ul className="divide-y divide-ink-200">
          {filtered.map((item) =>
            editing === item.id ? (
              <li key={item.id} className="py-3">
                <PriceBookFields
                  item={item}
                  taxRates={taxRates}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSubmit={(data) => run(() => savePriceBookItem({ ...data, id: item.id }), () => setEditing(null))}
                />
              </li>
            ) : (
              <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">
                    {item.name}
                    {!item.isActive ? <Badge className="ml-2">Off</Badge> : null}
                  </p>
                  <p className="text-sm text-ink-600">
                    {item.code} · {LINE_KIND[item.kind]?.label ?? item.kind} · per {item.unit} ·{" "}
                    {formatBp(item.defaultMarkupBp)} markup
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular font-bold">{formatMoney(item.unitCostCents)}</span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(item.id)}>Edit</Button>
                </div>
              </li>
            ),
          )}
          {filtered.length === 0 ? (
            <li className="py-4 text-ink-600">Nothing matched that search.</li>
          ) : null}
        </ul>
      </div>
    </Card>
  );
}

function PriceBookFields({
  item, taxRates, pending, onCancel, onSubmit,
}: {
  item?: {
    code: string; name: string; kind: string; unit: string;
    unitCostCents: number; defaultMarkupBp: number; isActive: boolean; taxRateId: string | null;
  };
  taxRates: Array<{ id: string; name: string }>;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="mb-4 grid gap-3 rounded-lg bg-ink-50 p-3 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          code: data.get("code"),
          name: data.get("name"),
          kind: data.get("kind"),
          unit: data.get("unit"),
          unitCostCents: data.get("unitCostCents"),
          defaultMarkupBp: Math.round((Number.parseFloat(String(data.get("pct"))) || 0) * 100),
          taxRateId: data.get("taxRateId"),
          isActive: data.get("isActive") === "on",
        });
      }}
    >
      <Field label="Code" htmlFor="pbcode" required>
        <Input id="pbcode" name="code" defaultValue={item?.code} required autoFocus placeholder="MAT-MGP10" />
      </Field>
      <Field label="Name" htmlFor="pbname" required className="sm:col-span-2">
        <Input id="pbname" name="name" defaultValue={item?.name} required placeholder="MGP10 pine 90x45" />
      </Field>
      <Field label="Counts as" htmlFor="pbkind">
        <Select id="pbkind" name="kind" defaultValue={item?.kind ?? "material"}>
          {["labour", "material", "subcontractor", "plant", "other"].map((kind) => (
            <option key={kind} value={kind}>{LINE_KIND[kind]?.label ?? kind}</option>
          ))}
        </Select>
      </Field>
      <Field label="Unit" htmlFor="pbunit">
        <Input id="pbunit" name="unit" defaultValue={item?.unit ?? "ea"} placeholder="lm, m2, hr, ea" />
      </Field>
      <Field label="Costs you" htmlFor="pbcost">
        <MoneyInput id="pbcost" name="unitCostCents" defaultValue={centsToInput(item?.unitCostCents ?? 0)} />
      </Field>
      <Field label="Markup %" htmlFor="pbpct">
        <Input id="pbpct" name="pct" type="number" step="0.5" min={0}
               defaultValue={(item?.defaultMarkupBp ?? 2000) / 100} className="tabular text-right" />
      </Field>
      <Field label="GST" htmlFor="pbtax">
        <Select id="pbtax" name="taxRateId" defaultValue={item?.taxRateId ?? ""}>
          <option value="">Default</option>
          {taxRates.map((rate) => <option key={rate.id} value={rate.id}>{rate.name}</option>)}
        </Select>
      </Field>
      <label className="flex min-h-[var(--tap)] items-center gap-2 font-semibold text-ink-800">
        <input type="checkbox" name="isActive" defaultChecked={item?.isActive ?? true}
               className="h-5 w-5 rounded border-2 border-ink-400" />
        In use
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={pending}>Save</Button>
      </div>
    </form>
  );
}

/* ---------------------------------- users --------------------------------- */

export function UserEditor({
  people,
  currentUserId,
}: {
  people: Array<{ id: string; fullName: string; email: string; phone: string | null; role: string; isActive: boolean; lastLoginAt: string | null }>;
  currentUserId: string;
}) {
  const { pending, error, notice, run } = useSave();
  const [editing, setEditing] = useState<string | "new" | null>(null);

  return (
    <Card>
      <CardHeader
        title="Who can sign in"
        subtitle="Three levels of access. Field workers never see a cost rate or a margin."
        action={
          editing !== "new" ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>+ Add someone</Button>
          ) : undefined
        }
      />
      <div className="p-4">
        <Feedback error={error} notice={notice} />

        {editing === "new" ? (
          <UserFields
            pending={pending}
            onCancel={() => setEditing(null)}
            onSubmit={(data) => run(() => saveUser(data), () => setEditing(null))}
          />
        ) : null}

        <ul className="divide-y divide-ink-200">
          {people.map((person) =>
            editing === person.id ? (
              <li key={person.id} className="py-3">
                <UserFields
                  person={person}
                  isSelf={person.id === currentUserId}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSubmit={(data) => run(() => saveUser({ ...data, id: person.id }), () => setEditing(null))}
                />
              </li>
            ) : (
              <li key={person.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">
                    {person.fullName}
                    {person.id === currentUserId ? <Badge className="ml-2">You</Badge> : null}
                    {!person.isActive ? <Badge tone="bad" className="ml-2">Switched off</Badge> : null}
                  </p>
                  <p className="truncate text-sm text-ink-600">{person.email}</p>
                  <p className="text-sm text-ink-500">
                    {ROLE_LABELS[person.role as Role]} ·{" "}
                    {person.lastLoginAt ? `last in ${new Date(person.lastLoginAt).toLocaleDateString("en-AU")}` : "never signed in"}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(person.id)}>Edit</Button>
              </li>
            ),
          )}
        </ul>

        <div className="mt-5 space-y-2 border-t border-ink-200 pt-4">
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <p key={role} className="text-sm">
              <strong className="text-ink-800">{ROLE_LABELS[role]}</strong>{" "}
              <span className="text-ink-600">{ROLE_DESCRIPTIONS[role]}</span>
            </p>
          ))}
        </div>
      </div>
    </Card>
  );
}

function UserFields({
  person, isSelf, pending, onCancel, onSubmit,
}: {
  person?: { fullName: string; email: string; phone: string | null; role: string; isActive: boolean };
  isSelf?: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="mb-4 grid gap-3 rounded-lg bg-ink-50 p-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          fullName: data.get("fullName"),
          email: data.get("email"),
          phone: data.get("phone"),
          role: data.get("role"),
          isActive: data.get("isActive") === "on",
          password: String(data.get("password") ?? "") || undefined,
        });
      }}
    >
      <Field label="Name" htmlFor="uname" required>
        <Input id="uname" name="fullName" defaultValue={person?.fullName} required autoFocus />
      </Field>
      <Field label="Email" htmlFor="uemail" required hint="This is what they sign in with.">
        <Input id="uemail" name="email" type="email" autoCapitalize="none" defaultValue={person?.email} required />
      </Field>
      <Field label="Phone" htmlFor="uphone">
        <Input id="uphone" name="phone" type="tel" defaultValue={person?.phone ?? ""} />
      </Field>
      <Field label="What can they do?" htmlFor="urole">
        <Select id="urole" name="role" defaultValue={person?.role ?? "field"} disabled={isSelf}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
          ))}
        </Select>
      </Field>
      <Field
        label={person ? "Reset their password" : "Starting password"}
        htmlFor="upassword"
        hint={person ? "Leave blank to keep the one they've got." : "At least 10 characters. They'll be asked to change it."}
        required={!person}
      >
        <Input id="upassword" name="password" type="text" autoComplete="new-password" minLength={person ? 0 : 10} />
      </Field>
      <label className="flex min-h-[var(--tap)] items-center gap-2 self-end font-semibold text-ink-800">
        <input type="checkbox" name="isActive" defaultChecked={person?.isActive ?? true} disabled={isSelf}
               className="h-5 w-5 rounded border-2 border-ink-400" />
        Can sign in
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={pending}>Save</Button>
      </div>
    </form>
  );
}

/* ------------------------------- templates -------------------------------- */

export function TemplateEditor({
  templates,
}: {
  templates: Array<{ id: string; key: string; name: string; subject: string; body: string }>;
}) {
  const { pending, error, notice, run } = useSave();

  return (
    <div className="space-y-5">
      <Feedback error={error} notice={notice} />
      <Card>
        <CardHeader
          title="How the placeholders work"
          subtitle="Anything in double braces is swapped for the real value when the email goes out."
        />
        <div className="p-4">
          <p className="font-mono text-sm text-ink-700">
            {"{{client_first_name}} · {{invoice_number}} · {{invoice_total}} · {{due_date}} · {{days_overdue}} · {{job_title}} · {{site_address}} · {{quote_number}} · {{quote_total}} · {{valid_days}} · {{sender_name}}"}
          </p>
        </div>
      </Card>

      {templates.map((template) => (
        <Card key={template.id}>
          <CardHeader title={template.name} />
          <form
            className="grid gap-4 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(() =>
                saveEmailTemplate({
                  id: template.id,
                  subject: data.get("subject"),
                  body: data.get("body"),
                }),
              );
            }}
          >
            <Field label="Subject" htmlFor={`sub-${template.id}`} required>
              <Input id={`sub-${template.id}`} name="subject" defaultValue={template.subject} required />
            </Field>
            <Field label="Message" htmlFor={`body-${template.id}`} required>
              <Textarea id={`body-${template.id}`} name="body" rows={10} defaultValue={template.body} required />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>Save</Button>
            </div>
          </form>
        </Card>
      ))}
    </div>
  );
}
