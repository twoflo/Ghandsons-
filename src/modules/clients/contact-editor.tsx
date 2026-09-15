"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveContact, saveSite } from "./actions";
import { Button, Field, Input, Textarea, Alert, Card, CardHeader } from "@/components/ui";
import type { ClientContact, ClientSite } from "./queries";

/** Add/edit the people at a client, inline, without leaving the page. */
export function ContactEditor({ clientId, contacts }: { clientId: string; contacts: ClientContact[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await saveContact({
        id,
        clientId,
        name: data.get("name"),
        role: data.get("role"),
        email: data.get("email"),
        phone: data.get("phone"),
        isPrimary: data.get("isPrimary") === "on",
      });
      if (result.ok) {
        setEditing(null);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Card id="contacts">
      <CardHeader
        title="People"
        subtitle="Who you actually talk to"
        action={
          editing !== "new" ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>+ Add</Button>
          ) : undefined
        }
      />
      {error ? <div className="px-4 pt-3"><Alert tone="bad">{error}</Alert></div> : null}

      {editing === "new" ? (
        <ContactFields onSubmit={(e) => submit(e)} onCancel={() => setEditing(null)} pending={pending} />
      ) : null}

      <ul className="divide-y divide-ink-200">
        {contacts.map((contact) =>
          editing === contact.id ? (
            <li key={contact.id}>
              <ContactFields
                contact={contact}
                onSubmit={(e) => submit(e, contact.id)}
                onCancel={() => setEditing(null)}
                pending={pending}
              />
            </li>
          ) : (
            <li key={contact.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">
                  {contact.name}
                  {contact.isPrimary ? <span className="ml-2 text-xs font-bold uppercase text-brand-700">Main</span> : null}
                </p>
                <p className="text-sm text-ink-600">{[contact.role, contact.phone, contact.email].filter(Boolean).join(" · ")}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(contact.id)}>Edit</Button>
            </li>
          ),
        )}
        {contacts.length === 0 && editing !== "new" ? (
          <li className="px-4 py-4 text-ink-600">No contacts yet.</li>
        ) : null}
      </ul>
    </Card>
  );
}

function ContactFields({
  contact, onSubmit, onCancel, pending,
}: {
  contact?: ClientContact;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-3 border-b border-ink-200 bg-ink-50 p-4 sm:grid-cols-2">
      <Field label="Name" htmlFor={`c-name-${contact?.id ?? "new"}`} required>
        <Input id={`c-name-${contact?.id ?? "new"}`} name="name" defaultValue={contact?.name} required autoFocus />
      </Field>
      <Field label="Their role" htmlFor={`c-role-${contact?.id ?? "new"}`}>
        <Input id={`c-role-${contact?.id ?? "new"}`} name="role" defaultValue={contact?.role ?? ""}
               placeholder="Accounts, site contact…" />
      </Field>
      <Field label="Phone" htmlFor={`c-phone-${contact?.id ?? "new"}`}>
        <Input id={`c-phone-${contact?.id ?? "new"}`} name="phone" type="tel" defaultValue={contact?.phone ?? ""} />
      </Field>
      <Field label="Email" htmlFor={`c-email-${contact?.id ?? "new"}`}>
        <Input id={`c-email-${contact?.id ?? "new"}`} name="email" type="email" autoCapitalize="none"
               defaultValue={contact?.email ?? ""} />
      </Field>
      <label className="flex min-h-[var(--tap)] items-center gap-2 font-semibold text-ink-800 sm:col-span-2">
        <input type="checkbox" name="isPrimary" defaultChecked={contact?.isPrimary}
               className="h-5 w-5 rounded border-2 border-ink-400" />
        Main contact for this client
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={pending}>{pending ? "Saving…" : "Save contact"}</Button>
      </div>
    </form>
  );
}

/** Same pattern for sites — a client can have several. */
export function SiteEditor({ clientId, sites }: { clientId: string; sites: ClientSite[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await saveSite({
        id,
        clientId,
        label: data.get("label"),
        addressLine1: data.get("addressLine1"),
        suburb: data.get("suburb"),
        state: data.get("state"),
        postcode: data.get("postcode"),
        accessNotes: data.get("accessNotes"),
        parkingNotes: data.get("parkingNotes"),
        hazardNotes: data.get("hazardNotes"),
      });
      if (result.ok) {
        setEditing(null);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Card id="sites">
      <CardHeader
        title="Sites"
        subtitle="Where the work happens. Access notes show up on the job page."
        action={
          editing !== "new" ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>+ Add</Button>
          ) : undefined
        }
      />
      {error ? <div className="px-4 pt-3"><Alert tone="bad">{error}</Alert></div> : null}

      {editing === "new" ? (
        <SiteFields onSubmit={(e) => submit(e)} onCancel={() => setEditing(null)} pending={pending} />
      ) : null}

      <ul className="divide-y divide-ink-200">
        {sites.map((site) =>
          editing === site.id ? (
            <li key={site.id}>
              <SiteFields site={site} onSubmit={(e) => submit(e, site.id)} onCancel={() => setEditing(null)} pending={pending} />
            </li>
          ) : (
            <li key={site.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{site.label}</p>
                <p className="text-sm text-ink-600">
                  {[site.addressLine1, site.suburb, site.state, site.postcode].filter(Boolean).join(" ")}
                </p>
                {site.hazardNotes ? (
                  <p className="mt-1 text-sm text-bad-700">⚠️ {site.hazardNotes}</p>
                ) : null}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(site.id)}>Edit</Button>
            </li>
          ),
        )}
        {sites.length === 0 && editing !== "new" ? (
          <li className="px-4 py-4 text-ink-600">No sites yet. Add one so jobs have an address.</li>
        ) : null}
      </ul>
    </Card>
  );
}

function SiteFields({
  site, onSubmit, onCancel, pending,
}: {
  site?: ClientSite;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const key = site?.id ?? "new";
  return (
    <form onSubmit={onSubmit} className="grid gap-3 border-b border-ink-200 bg-ink-50 p-4 sm:grid-cols-2">
      <Field label="Short name" htmlFor={`s-label-${key}`} required className="sm:col-span-2"
             hint="What you'd call it out loud — “Home — Bardon”, “Unit 3”.">
        <Input id={`s-label-${key}`} name="label" defaultValue={site?.label} required autoFocus />
      </Field>
      <Field label="Street" htmlFor={`s-addr-${key}`} className="sm:col-span-2">
        <Input id={`s-addr-${key}`} name="addressLine1" defaultValue={site?.addressLine1 ?? ""} />
      </Field>
      <Field label="Suburb" htmlFor={`s-sub-${key}`}>
        <Input id={`s-sub-${key}`} name="suburb" defaultValue={site?.suburb ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="State" htmlFor={`s-state-${key}`}>
          <Input id={`s-state-${key}`} name="state" defaultValue={site?.state ?? "QLD"} maxLength={3} />
        </Field>
        <Field label="Postcode" htmlFor={`s-pc-${key}`}>
          <Input id={`s-pc-${key}`} name="postcode" inputMode="numeric" maxLength={4} defaultValue={site?.postcode ?? ""} />
        </Field>
      </div>
      <Field label="Getting in" htmlFor={`s-access-${key}`} className="sm:col-span-2"
             hint="Keys, dogs, gate codes, body corporate hours.">
        <Textarea id={`s-access-${key}`} name="accessNotes" rows={2} defaultValue={site?.accessNotes ?? ""} />
      </Field>
      <Field label="Parking" htmlFor={`s-park-${key}`}>
        <Textarea id={`s-park-${key}`} name="parkingNotes" rows={2} />
      </Field>
      <Field label="Hazards" htmlFor={`s-haz-${key}`}
             hint="Shows as a red warning on every job at this site.">
        <Textarea id={`s-haz-${key}`} name="hazardNotes" rows={2} defaultValue={site?.hazardNotes ?? ""} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={pending}>{pending ? "Saving…" : "Save site"}</Button>
      </div>
    </form>
  );
}
