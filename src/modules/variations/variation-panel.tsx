"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveVariation, setVariationStatus, archiveVariation } from "./actions";
import { LineEditor } from "@/modules/quotes/line-editor";
import { newLine, type EditorLine } from "@/modules/quotes/editor-line";
import type { PriceBookEntry } from "@/modules/quotes/queries";
import type { VariationRow, VariationLineRow } from "./queries";
import {
  Button, Field, Input, Select, Textarea, Alert, Card, CardHeader, Badge, EmptyState,
} from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { formatDate, isoDate } from "@/lib/dates";
import { VARIATION_STATUS, type VariationStatus } from "@/lib/status";

const REASONS = [
  { value: "client_request", label: "The client asked for it" },
  { value: "site_condition", label: "Something we found on site" },
  { value: "design_change", label: "A change to the drawings" },
  { value: "error", label: "Something we got wrong" },
  { value: "other", label: "Something else" },
];

type Props = {
  jobId: string;
  variations: Array<VariationRow & { lines: VariationLineRow[] }>;
  priceBook: PriceBookEntry[];
  taxRates: Array<{ id: string; name: string; rateBp: number }>;
  defaultMarkupBp: number;
  canManage: boolean;
  canApprove: boolean;
  showCost: boolean;
};

/**
 * Variations on a job.
 *
 * The lifecycle is the point: draft while you price it, submitted once the
 * client has it, approved with a name against it. Only an approved variation
 * lifts the contract value and shows up on the next claim — which is the
 * whole reason for tracking them separately from the quote.
 */
export function VariationPanel({
  jobId, variations, priceBook, taxRates, defaultMarkupBp, canManage, canApprove, showCost,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [approvedBy, setApprovedBy] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const approved = variations.filter((v) => v.status === "approved" || v.status === "invoiced");
  const pendingApproval = variations.filter((v) => v.status === "submitted");
  const approvedValue = approved.reduce((a, v) => a + v.subtotalCents, 0);
  const pendingValue = pendingApproval.reduce((a, v) => a + v.subtotalCents, 0);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setNotice(result.message ?? "Done.");
        setEditing(null);
        setApproving(null);
        setRejecting(null);
        setApprovedBy("");
        setReason("");
        router.refresh();
      } else {
        setError(result.message ?? "That didn't work.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {notice ? <Alert tone="good">{notice}</Alert> : null}

      {variations.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="card border-l-4 border-good-600 px-4 py-3">
            <p className="text-sm font-semibold text-ink-600">Approved</p>
            <p className="tabular text-2xl font-black text-ink-900">{formatMoney(approvedValue)}</p>
            <p className="text-sm text-ink-500">added to the contract</p>
          </div>
          <div className={`card border-l-4 px-4 py-3 ${pendingValue > 0 ? "border-warn-600" : "border-ink-200"}`}>
            <p className="text-sm font-semibold text-ink-600">Waiting on the client</p>
            <p className="tabular text-2xl font-black text-ink-900">{formatMoney(pendingValue)}</p>
            <p className="text-sm text-ink-500">
              {pendingApproval.length === 0
                ? "nothing outstanding"
                : `${pendingApproval.length} not signed off`}
            </p>
          </div>
        </div>
      ) : null}

      {pendingApproval.some((v) => (v.ageDays ?? 0) > 5) ? (
        <Alert tone="warn" title="Chase these up">
          A variation that&apos;s been sitting with the client for a week usually means the work has
          already been done and nobody&apos;s agreed to pay for it.
        </Alert>
      ) : null}

      {canManage && editing !== "new" ? (
        <Button onClick={() => setEditing("new")}>+ Raise a variation</Button>
      ) : null}

      {editing === "new" ? (
        <VariationForm
          jobId={jobId}
          priceBook={priceBook}
          taxRates={taxRates}
          defaultMarkupBp={defaultMarkupBp}
          showCost={showCost}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(payload) => run(() => saveVariation(payload))}
        />
      ) : null}

      {variations.length === 0 && editing !== "new" ? (
        <Card>
          <EmptyState
            icon="🔧"
            title="No variations on this job"
            body="When the scope changes — a client request, or something you find once the wall's open — price it here and get it signed off before you do the work."
            action={canManage ? <Button onClick={() => setEditing("new")}>+ Raise a variation</Button> : undefined}
          />
        </Card>
      ) : null}

      <ul className="space-y-4">
        {variations.map((variation) => {
          const status = VARIATION_STATUS[variation.status as VariationStatus];
          const isEditing = editing === variation.id;

          if (isEditing) {
            return (
              <li key={variation.id}>
                <VariationForm
                  jobId={jobId}
                  variation={variation}
                  priceBook={priceBook}
                  taxRates={taxRates}
                  defaultMarkupBp={variation.markupBp}
                  showCost={showCost}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSave={(payload) => run(() => saveVariation({ ...payload, id: variation.id }))}
                />
              </li>
            );
          }

          return (
            <li key={variation.id}>
              <Card>
                <CardHeader
                  title={`${variation.variationNumber} — ${variation.title}`}
                  subtitle={
                    variation.raisedOn
                      ? `Raised ${formatDate(variation.raisedOn)}${
                          variation.timeImpactDays > 0 ? ` · adds ${variation.timeImpactDays} days` : ""
                        }`
                      : undefined
                  }
                  action={<Badge tone={status.tone}>{status.label}</Badge>}
                />

                <div className="space-y-3 p-4">
                  {variation.description ? (
                    <p className="whitespace-pre-line text-ink-800">{variation.description}</p>
                  ) : null}

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[24rem] text-sm">
                      <caption className="sr-only">Variation lines</caption>
                      <tbody className="divide-y divide-ink-200">
                        {variation.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="py-1.5 pr-2 text-ink-800">{line.description}</td>
                            <td className="py-1.5 pr-2 text-right tabular text-ink-600">
                              {Number(line.quantity)} {line.unit}
                            </td>
                            {showCost ? (
                              <td className="py-1.5 pr-2 text-right tabular text-ink-500">
                                {formatMoney(line.lineCostCents)}
                              </td>
                            ) : null}
                            <td className="py-1.5 text-right tabular font-semibold">
                              {formatMoney(line.lineSubtotalCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <dl className="ml-auto max-w-xs space-y-1 border-t-2 border-ink-300 pt-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="font-semibold text-ink-700">Ex GST</dt>
                      <dd className="tabular font-semibold">{formatMoney(variation.subtotalCents)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="font-semibold text-ink-700">GST</dt>
                      <dd className="tabular font-semibold">{formatMoney(variation.taxCents)}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-ink-300 pt-1">
                      <dt className="font-bold">Total</dt>
                      <dd className="tabular text-lg font-black">{formatMoney(variation.totalCents)}</dd>
                    </div>
                    {showCost ? (
                      <div className="flex justify-between gap-4 text-ink-500">
                        <dt>Costs us</dt>
                        <dd className="tabular">{formatMoney(variation.costCents)}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {variation.status === "approved" ? (
                    <Alert tone="good" title={`Approved by ${variation.approvedByName}`}>
                      {formatDate(variation.approvedAt)} — it&apos;s on the contract and will appear on
                      the next claim.
                      {variation.approvalFileId ? (
                        <>
                          {" "}
                          <a
                            href={`/api/files/${variation.approvalFileId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold underline"
                          >
                            See the signed approval
                          </a>
                        </>
                      ) : null}
                    </Alert>
                  ) : null}

                  {variation.status === "invoiced" && variation.invoiceId ? (
                    <Alert tone="good" title="Invoiced">
                      On{" "}
                      <Link href={`/invoices/${variation.invoiceId}`} className="font-bold underline">
                        {variation.invoiceNumber}
                      </Link>
                      .
                    </Alert>
                  ) : null}

                  {variation.status === "rejected" ? (
                    <Alert tone="bad" title="The client said no">
                      {variation.rejectedReason ?? "No reason recorded."}
                    </Alert>
                  ) : null}

                  {variation.status === "submitted" ? (
                    <Alert tone="warn" title="Waiting on the client">
                      Sent {variation.ageDays ?? 0} day{variation.ageDays === 1 ? "" : "s"} ago. Don&apos;t
                      do this part of the work until it&apos;s signed off.
                    </Alert>
                  ) : null}

                  {approving === variation.id ? (
                    <div className="rounded-lg border-2 border-good-600 bg-good-50 p-3">
                      <Field label="Who at the client approved it?" htmlFor={`app-${variation.id}`} required>
                        <Input
                          id={`app-${variation.id}`}
                          value={approvedBy}
                          onChange={(e) => setApprovedBy(e.target.value)}
                          autoFocus
                        />
                      </Field>
                      <div className="mt-3 flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setApproving(null)} disabled={pending}>
                          Cancel
                        </Button>
                        <Button
                          variant="success"
                          className="flex-1"
                          disabled={pending || !approvedBy.trim()}
                          onClick={() =>
                            run(() =>
                              setVariationStatus({
                                variationId: variation.id,
                                status: "approved",
                                approvedByName: approvedBy,
                              }),
                            )
                          }
                        >
                          Approve it
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {rejecting === variation.id ? (
                    <div className="rounded-lg border-2 border-bad-600 bg-bad-50 p-3">
                      <Field label="What did they say?" htmlFor={`rej-${variation.id}`}>
                        <Input
                          id={`rej-${variation.id}`}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Too dear, they'll live with it"
                          autoFocus
                        />
                      </Field>
                      <div className="mt-3 flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setRejecting(null)} disabled={pending}>
                          Cancel
                        </Button>
                        <Button
                          variant="danger"
                          className="flex-1"
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              setVariationStatus({
                                variationId: variation.id,
                                status: "rejected",
                                rejectedReason: reason,
                              }),
                            )
                          }
                        >
                          Mark rejected
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {canManage ? (
                    <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-3">
                      {variation.status === "draft" ? (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(variation.id)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              run(() => setVariationStatus({ variationId: variation.id, status: "submitted" }))
                            }
                          >
                            Send to the client
                          </Button>
                        </>
                      ) : null}

                      {variation.status === "submitted" ? (
                        <>
                          {canApprove ? (
                            <Button size="sm" variant="success" onClick={() => setApproving(variation.id)}>
                              They approved it
                            </Button>
                          ) : (
                            <span className="self-center text-sm text-ink-500">
                              Only the owner can mark this approved.
                            </span>
                          )}
                          <Button size="sm" variant="danger" onClick={() => setRejecting(variation.id)}>
                            They said no
                          </Button>
                        </>
                      ) : null}

                      {variation.status === "approved" ? (
                        <Link
                          href={`/invoices/new?jobId=${jobId}`}
                          className="inline-flex min-h-9 items-center rounded-lg border-2 border-brand-600 bg-brand-600 px-3 text-sm font-bold text-white"
                        >
                          Put it on a claim
                        </Link>
                      ) : null}

                      {variation.status === "draft" || variation.status === "rejected" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => archiveVariation({ variationId: variation.id }))}
                        >
                          Archive
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type SavePayload = {
  jobId: string;
  title: string;
  description: string;
  reason: string;
  raisedOn: string;
  markupBp: number;
  timeImpactDays: number;
  lines: Array<{
    id?: string;
    kind: string;
    description: string;
    quantity: string;
    unit: string;
    unitCostCents: string;
    markupBp: number | null;
    taxRateId: string | null;
  }>;
};

function VariationForm({
  jobId, variation, priceBook, taxRates, defaultMarkupBp, showCost, pending, onCancel, onSave,
}: {
  jobId: string;
  variation?: VariationRow & { lines: VariationLineRow[] };
  priceBook: PriceBookEntry[];
  taxRates: Array<{ id: string; name: string; rateBp: number }>;
  defaultMarkupBp: number;
  showCost: boolean;
  pending: boolean;
  onCancel: () => void;
  onSave: (payload: SavePayload) => void;
}) {
  const defaultRate = taxRates.find((r) => r.rateBp > 0) ?? taxRates[0];

  const [title, setTitle] = useState(variation?.title ?? "");
  const [description, setDescription] = useState(variation?.description ?? "");
  const [reason, setReason] = useState(variation?.reason ?? "client_request");
  const [raisedOn, setRaisedOn] = useState(variation?.raisedOn ?? isoDate(new Date()));
  const [markupBp, setMarkupBp] = useState(defaultMarkupBp);
  const [timeImpactDays, setTimeImpactDays] = useState(variation?.timeImpactDays ?? 0);
  const [lines, setLines] = useState<EditorLine[]>(
    variation?.lines.length
      ? variation.lines.map((l) => ({
          key: l.id,
          id: l.id,
          sortOrder: l.sortOrder,
          isHeading: false,
          kind: l.kind as EditorLine["kind"],
          description: l.description,
          quantity: String(Number(l.quantity)),
          unit: l.unit,
          unitCostCents: l.unitCostCents,
          markupBp: l.markupBp,
          taxRateId: l.taxRateId,
          taxRateBp: l.taxRateBp,
          priceBookItemId: null,
        }))
      : [newLine(0, defaultRate?.id ?? null, defaultRate?.rateBp ?? 0)],
  );

  return (
    <Card className="border-2 border-brand-500">
      <CardHeader
        title={variation ? `Edit ${variation.variationNumber}` : "Raise a variation"}
        subtitle="Priced the same way as a quote — cost plus markup."
      />
      <div className="space-y-4 p-4">
        <Field label="What's changed?" htmlFor="vtitle" required
               hint="A line the client will recognise. “Replace corroded waste stack”.">
          <Input id="vtitle" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>

        <Field label="What happened, in plain words" htmlFor="vdesc"
               hint="This is what the client reads when deciding. Say why it's needed.">
          <Textarea id="vdesc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Why?" htmlFor="vreason">
            <Select id="vreason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
          <Field label="Raised on" htmlFor="vdate">
            <Input id="vdate" type="date" value={raisedOn} onChange={(e) => setRaisedOn(e.target.value)} />
          </Field>
          <Field label="Days it adds" htmlFor="vdays"
                 hint="Pushes the job's finish date out when approved.">
            <Input
              id="vdays"
              type="number"
              min={0}
              max={365}
              value={timeImpactDays}
              onChange={(e) => setTimeImpactDays(Number.parseInt(e.target.value, 10) || 0)}
              className="tabular text-right"
            />
          </Field>
        </div>

        {showCost ? (
          <Field label="Markup" htmlFor="vmarkup">
            <div className="flex max-w-32 items-center gap-2">
              <Input
                id="vmarkup"
                type="number"
                step="0.5"
                min={0}
                value={markupBp / 100}
                onChange={(e) => setMarkupBp(Math.round((Number.parseFloat(e.target.value) || 0) * 100))}
                className="tabular text-right"
              />
              <span className="font-bold text-ink-600">%</span>
            </div>
          </Field>
        ) : null}

        <LineEditor
          lines={lines}
          onChange={setLines}
          globalMarkupBp={markupBp}
          priceBook={priceBook}
          taxRates={taxRates}
          showCost={showCost}
        />

        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-[2]"
            disabled={pending || title.trim().length < 3}
            onClick={() =>
              onSave({
                jobId,
                title,
                description,
                reason,
                raisedOn,
                markupBp,
                timeImpactDays,
                lines: lines.map((l) => ({
                  id: l.id,
                  kind: l.kind,
                  description: l.description || "Item",
                  quantity: l.quantity,
                  unit: l.unit,
                  unitCostCents: String(l.unitCostCents / 100),
                  markupBp: l.markupBp,
                  taxRateId: l.taxRateId ?? null,
                })),
              })
            }
          >
            {pending ? "Saving…" : variation ? "Save changes" : "Raise it"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
