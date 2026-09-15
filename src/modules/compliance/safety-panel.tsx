"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signSafetyDoc, saveSafetyDoc } from "./actions";
import { SAFETY_DOC_KINDS } from "./constants";
import { Button, Field, Input, Select, Alert, Card, CardHeader, Badge, EmptyState } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { SafetyDoc } from "./queries";

/**
 * SWMS on a job.
 *
 * The sign-off is a typed name rather than a picked user, because subbies
 * and visitors sign these and none of them have a login. What matters for
 * an inspection is that there is a name and a timestamp against the version
 * of the document that was on site.
 */
export function SafetyPanel({
  jobId,
  docs,
  currentUserName,
  canManage,
}: {
  jobId: string;
  docs: SafetyDoc[];
  currentUserName: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [signing, setSigning] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(currentUserName);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setSigning(null);
        setAdding(false);
        setNotice(result.message ?? "Done.");
        router.refresh();
      } else {
        setError(result.message ?? "That didn't work.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {notice ? <Alert tone="good">{notice}</Alert> : null}

      {canManage && !adding ? <Button onClick={() => setAdding(true)}>+ Add a SWMS or safety doc</Button> : null}

      {adding ? (
        <Card className="border-2 border-brand-500">
          <CardHeader title="Add a safety document" />
          <form
            className="grid gap-4 p-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              run(() =>
                saveSafetyDoc({
                  jobId,
                  kind: data.get("kind"),
                  title: data.get("title"),
                  version: data.get("version"),
                  validFrom: data.get("validFrom"),
                  validTo: data.get("validTo"),
                  highRiskActivities: String(data.get("risks") ?? "")
                    .split(",")
                    .map((r) => r.trim())
                    .filter(Boolean),
                }),
              );
            }}
          >
            <Field label="What sort?" htmlFor="sdkind">
              <Select id="sdkind" name="kind" defaultValue="swms">
                {SAFETY_DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </Select>
            </Field>
            <Field label="Version" htmlFor="sdver">
              <Input id="sdver" name="version" defaultValue="1" />
            </Field>
            <Field label="Title" htmlFor="sdtitle" required className="sm:col-span-2">
              <Input id="sdtitle" name="title" placeholder="SWMS — work at height, rear elevation" required />
            </Field>
            <Field label="Valid from" htmlFor="sdfrom">
              <Input id="sdfrom" name="validFrom" type="date" />
            </Field>
            <Field label="Valid to" htmlFor="sdto">
              <Input id="sdto" name="validTo" type="date" />
            </Field>
            <Field label="High-risk activities" htmlFor="sdrisks" className="sm:col-span-2"
                   hint="Separate with commas. Work above 2m, asbestos, confined space…">
              <Input id="sdrisks" name="risks" placeholder="Work above 2m, powered mobile plant" />
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setAdding(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
            <p className="text-sm text-ink-600 sm:col-span-2">
              Attach the PDF itself from the Documents tab once this is saved.
            </p>
          </form>
        </Card>
      ) : null}

      {docs.length === 0 && !adding ? (
        <Card>
          <EmptyState
            icon="🦺"
            title="No safety documents on this job"
            body="A SWMS is required for high-risk work, and an inspector will ask to see it with everyone's signature on it."
          />
        </Card>
      ) : null}

      {docs.map((doc) => {
        const expired = doc.validTo && doc.validTo < new Date().toISOString().slice(0, 10);
        return (
          <Card key={doc.id}>
            <CardHeader
              title={doc.title}
              subtitle={
                [
                  SAFETY_DOC_KINDS.find((k) => k.value === doc.kind)?.label ?? doc.kind,
                  `v${doc.version}`,
                  doc.validTo ? `valid to ${formatDate(doc.validTo)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              }
              action={
                expired ? (
                  <Badge tone="bad">Out of date</Badge>
                ) : (
                  <Badge tone="good">{doc.signoffs.length} signed</Badge>
                )
              }
            />
            <div className="space-y-3 p-4">
              {doc.highRiskActivities.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {doc.highRiskActivities.map((risk) => (
                    <Badge key={risk} tone="warn">⚠️ {risk}</Badge>
                  ))}
                </div>
              ) : null}

              {doc.fileId ? (
                <a
                  href={`/api/files/${doc.fileId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[var(--tap)] items-center rounded-lg border-2 border-ink-300 bg-white px-3 font-semibold"
                >
                  📄 Read it
                </a>
              ) : null}

              {doc.signoffs.length > 0 ? (
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-ink-500">Signed by</p>
                  <ul className="mt-1 space-y-0.5">
                    {doc.signoffs.map((signoff, i) => (
                      <li key={`${signoff.name}-${i}`} className="text-sm text-ink-700">
                        {signoff.name} — {formatDateTime(signoff.signedAt)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm font-semibold text-warn-700">
                  Nobody has signed this yet. Everyone on site has to before the work starts.
                </p>
              )}

              {signing === doc.id ? (
                <div className="rounded-lg border-2 border-good-600 bg-good-50 p-3">
                  <Field label="Your name" htmlFor={`sign-${doc.id}`} required
                         hint="Typing your name here is your signature on this document.">
                    <Input id={`sign-${doc.id}`} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                  </Field>
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setSigning(null)} disabled={pending}>
                      Cancel
                    </Button>
                    <Button
                      variant="success"
                      className="flex-1"
                      disabled={pending || name.trim().length < 2}
                      onClick={() => run(() => signSafetyDoc({ safetyDocId: doc.id, signedName: name }))}
                    >
                      Sign it
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setSigning(doc.id)}>
                  ✍️ Sign this
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
