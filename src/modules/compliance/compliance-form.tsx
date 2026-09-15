"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveComplianceItem, archiveComplianceItem } from "./actions";
import { COMPLIANCE_KINDS } from "./constants";
import { Button, Field, Input, MoneyInput, Select, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import { centsToInput } from "@/lib/money";
import type { ComplianceItem } from "./queries";

export function ComplianceForm({
  item,
  workers,
  suppliers,
  onDone,
}: {
  item?: ComplianceItem;
  workers: Array<{ id: string; fullName: string }>;
  suppliers: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [subjectType, setSubjectType] = useState(item?.subjectType ?? "worker");
  const [subjectId, setSubjectId] = useState(item?.subjectId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function labelFor(type: string, id: string): string {
    if (type === "business") return "The business";
    if (type === "supplier" || type === "subcontractor") {
      return suppliers.find((s) => s.id === id)?.name ?? workers.find((w) => w.id === id)?.fullName ?? "";
    }
    return workers.find((w) => w.id === id)?.fullName ?? "";
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const label = labelFor(subjectType, subjectId) || String(data.get("subjectLabel") ?? "");

    setError(null);
    startTransition(async () => {
      const result = await saveComplianceItem({
        id: item?.id,
        subjectType,
        subjectId: subjectType === "business" ? null : subjectId,
        subjectLabel: label,
        kind: data.get("kind"),
        name: data.get("name"),
        identifier: data.get("identifier"),
        issuer: data.get("issuer"),
        issueDate: data.get("issueDate"),
        expiryDate: data.get("expiryDate"),
        coverageCents: data.get("coverageCents"),
        remindDaysBefore: data.get("remindDaysBefore"),
        notes: data.get("notes"),
      });
      if (result.ok) {
        onDone();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Card className="border-2 border-brand-500">
      <CardHeader title={item ? `Edit ${item.name}` : "Record a licence, ticket or insurance"} />
      <form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-2">
        {error ? <div className="sm:col-span-2"><Alert tone="bad">{error}</Alert></div> : null}

        <Field label="Whose is it?" htmlFor="csubjtype">
          <Select
            id="csubjtype"
            value={subjectType}
            onChange={(e) => {
              setSubjectType(e.target.value);
              setSubjectId("");
            }}
          >
            <option value="business">The business</option>
            <option value="worker">Someone on the crew</option>
            <option value="subcontractor">A subcontractor</option>
            <option value="supplier">A supplier</option>
          </Select>
        </Field>

        {subjectType !== "business" ? (
          <Field label="Who exactly?" htmlFor="csubj" required>
            <Select id="csubj" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
              <option value="">Choose…</option>
              {(subjectType === "worker" ? workers.map((w) => ({ id: w.id, name: w.fullName })) : suppliers).map(
                (option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ),
              )}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="subjectLabel" value="The business" />
        )}

        <Field label="What sort?" htmlFor="ckind">
          <Select id="ckind" name="kind" defaultValue={item?.kind ?? "licence"}>
            {COMPLIANCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
        </Field>

        <Field label="What's it called?" htmlFor="cname" required
               hint="“QBCC contractor licence”, “White card”, “Public liability $20m”.">
          <Input id="cname" name="name" defaultValue={item?.name} required />
        </Field>

        <Field label="Number" htmlFor="cident">
          <Input id="cident" name="identifier" defaultValue={item?.identifier ?? ""} />
        </Field>

        <Field label="Who issued it?" htmlFor="cissuer">
          <Input id="cissuer" name="issuer" defaultValue={item?.issuer ?? ""} placeholder="QBCC, WorkCover, CGU…" />
        </Field>

        <Field label="Issued" htmlFor="cissued">
          <Input id="cissued" name="issueDate" type="date" defaultValue={item?.issueDate ?? ""} />
        </Field>

        <Field label="Expires" htmlFor="cexpiry" required
               hint="This is what drives the warning on your dashboard.">
          <Input id="cexpiry" name="expiryDate" type="date" defaultValue={item?.expiryDate ?? ""} />
        </Field>

        <Field label="Warn me this many days before" htmlFor="cremind">
          <Input
            id="cremind"
            name="remindDaysBefore"
            type="number"
            min={0}
            max={365}
            defaultValue={item?.remindDaysBefore ?? 30}
            className="tabular text-right"
          />
        </Field>

        <Field label="Cover amount" htmlFor="ccover" hint="For insurances. Leave blank otherwise.">
          <MoneyInput id="ccover" name="coverageCents" defaultValue={centsToInput(item?.coverageCents ?? null)} />
        </Field>

        <Field label="Notes" htmlFor="cnotes" className="sm:col-span-2">
          <Textarea id="cnotes" name="notes" rows={2} defaultValue={item?.notes ?? ""} />
        </Field>

        <div className="flex gap-2 sm:col-span-2">
          {item ? (
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await archiveComplianceItem({ itemId: item.id });
                  if (result.ok) {
                    onDone();
                    router.refresh();
                  } else {
                    setError(result.message);
                  }
                })
              }
            >
              Archive
            </Button>
          ) : null}
          <Button type="button" variant="secondary" className="flex-1" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
