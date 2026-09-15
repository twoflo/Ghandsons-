import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { ClientForm } from "@/modules/clients/client-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New client" };
export const dynamic = "force-dynamic";

export default async function NewClientPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "clients.manage")) redirect("/clients");

  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New client"
        subtitle="Name and a phone number is enough to start."
        back={{ href: "/clients", label: "All clients" }}
      />
      <ClientForm
        defaultTermsDays={settings.defaultPaymentTermsDays}
        initial={{
          name: "", type: "individual", abn: "", email: "", phone: "",
          addressLine1: "", addressLine2: "", suburb: "", state: "QLD", postcode: "",
          paymentTermsDays: "", onHold: false, notes: "", source: "",
        }}
      />
    </div>
  );
}
