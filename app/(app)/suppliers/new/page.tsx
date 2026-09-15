import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getExpenseFormOptions } from "@/modules/expenses/queries";
import { SupplierForm } from "@/modules/procurement/supplier-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New supplier" };
export const dynamic = "force-dynamic";

export default async function NewSupplierPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "suppliers.manage")) redirect("/suppliers");

  const { categories } = await getExpenseFormOptions();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New supplier"
        subtitle="The name and the ABN are what make receipts match themselves."
        back={{ href: "/suppliers", label: "All suppliers" }}
      />
      <SupplierForm
        categories={categories}
        initial={{
          name: "", abn: "", email: "", phone: "", addressLine1: "", suburb: "",
          state: "QLD", postcode: "", accountNumber: "", contactName: "",
          paymentTermsDays: 30, defaultCategoryId: "", notes: "",
        }}
      />
    </div>
  );
}
