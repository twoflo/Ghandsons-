"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWorkerRates } from "./actions";
import { Button, Field, Input, MoneyInput, Select, Alert } from "@/components/ui";
import { centsToInput, parseMoneyToCents, formatBp, marginBp } from "@/lib/money";

/**
 * Pay and charge rates. Owner only — these are the most sensitive numbers in
 * the business, and changing one must not rewrite what a job has already
 * cost, which is why entries snapshot their rates when they're written.
 */
export function RateEditor(props: {
  userId: string;
  fullName: string;
  costRateCents: number;
  chargeRateCents: number;
  employmentType: "employee" | "subcontractor";
  trade: string;
  standardHoursPerWeek: number;
  abn: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState(centsToInput(props.costRateCents));
  const [charge, setCharge] = useState(centsToInput(props.chargeRateCents));
  const [employmentType, setEmploymentType] = useState(props.employmentType);
  const [trade, setTrade] = useState(props.trade);
  const [hours, setHours] = useState(String(props.standardHoursPerWeek));
  const [abn, setAbn] = useState(props.abn);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const costCents = parseMoneyToCents(cost) ?? 0;
  const chargeCents = parseMoneyToCents(charge) ?? 0;
  const margin = chargeCents > 0 ? marginBp(costCents, chargeCents) : null;

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Change rates
      </Button>
    );
  }

  return (
    <div className="w-full rounded-lg border-2 border-ink-300 bg-ink-50 p-3">
      <p className="mb-2 font-bold text-ink-900">{props.fullName}</p>
      {error ? <div className="mb-2"><Alert tone="bad">{error}</Alert></div> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Costs us per hour" htmlFor={`cost-${props.userId}`}
               hint="Wages plus on-costs — super, insurance, leave.">
          <MoneyInput id={`cost-${props.userId}`} value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="Charged out per hour" htmlFor={`charge-${props.userId}`}
               hint={margin !== null ? `${formatBp(margin)} margin` : undefined}>
          <MoneyInput id={`charge-${props.userId}`} value={charge} onChange={(e) => setCharge(e.target.value)} />
        </Field>
        <Field label="Employed how?" htmlFor={`emp-${props.userId}`}>
          <Select
            id={`emp-${props.userId}`}
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value as "employee" | "subcontractor")}
          >
            <option value="employee">On the books</option>
            <option value="subcontractor">Subcontractor</option>
          </Select>
        </Field>
        <Field label="Trade" htmlFor={`trade-${props.userId}`}>
          <Input id={`trade-${props.userId}`} value={trade} onChange={(e) => setTrade(e.target.value)} />
        </Field>
        <Field label="Standard hours a week" htmlFor={`hrs-${props.userId}`}>
          <Input
            id={`hrs-${props.userId}`}
            type="number"
            min={0}
            max={80}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="tabular text-right"
          />
        </Field>
        {employmentType === "subcontractor" ? (
          <Field label="ABN" htmlFor={`abn-${props.userId}`}>
            <Input id={`abn-${props.userId}`} value={abn} onChange={(e) => setAbn(e.target.value)} />
          </Field>
        ) : null}
      </div>

      <p className="mt-3 text-sm text-ink-600">
        Changing these only affects hours logged from now on. Timesheets already entered keep the
        rates they were costed at.
      </p>

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveWorkerRates({
                userId: props.userId,
                costRateCents: costCents,
                chargeRateCents: chargeCents,
                employmentType,
                trade,
                standardHoursPerWeek: hours,
                abn,
              });
              if (result.ok) {
                setOpen(false);
                router.refresh();
              } else {
                setError(result.message);
              }
            })
          }
        >
          {pending ? "Saving…" : "Save rates"}
        </Button>
      </div>
    </div>
  );
}
