import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { getClient, getClientContacts, getClientSites } from "@/modules/clients/queries";
import { ClientForm } from "@/modules/clients/client-form";
import { ContactEditor, SiteEditor } from "@/modules/clients/contact-editor";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Edit client" };
export const dynamic = "force-dynamic";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!can(user.role, "clients.manage")) redirect(`/clients/${id}`);

  const [client, contacts, sites, settings] = await Promise.all([
    getClient(id), getClientContacts(id), getClientSites(id), getSettings(),
  ]);
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={`Edit ${client.name}`}
        back={{ href: `/clients/${id}`, label: "Back to the client" }}
      />

      <ContactEditor clientId={id} contacts={contacts} />
      <SiteEditor clientId={id} sites={sites} />

      <ClientForm
        defaultTermsDays={settings.defaultPaymentTermsDays}
        initial={{
          id: client.id,
          name: client.name,
          type: client.type as "individual" | "company",
          abn: client.abn ?? "",
          email: client.email ?? "",
          phone: client.phone ?? "",
          addressLine1: client.addressLine1 ?? "",
          addressLine2: client.addressLine2 ?? "",
          suburb: client.suburb ?? "",
          state: client.state ?? "QLD",
          postcode: client.postcode ?? "",
          paymentTermsDays: client.paymentTermsDays ? String(client.paymentTermsDays) : "",
          onHold: client.onHold,
          notes: client.notes ?? "",
          source: client.source ?? "",
        }}
      />
    </div>
  );
}
