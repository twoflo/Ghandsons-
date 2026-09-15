import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSupplier } from "@/modules/procurement/queries";
import { getExpenseFormOptions } from "@/modules/expenses/queries";
import { SupplierForm } from "@/modules/procurement/supplier-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Edit supplier" };
export const dynamic = "force-dynamic";

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!can(user.role, "suppliers.manage")) redirect(`/suppliers/${id}`);

  const [supplier, { categories }] = await Promise.all([getSupplier(id), getExpenseFormOptions()]);
  if (!supplier) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${supplier.name}`}
        back={{ href: `/suppliers/${id}`, label: "Back to the supplier" }}
      />
      <SupplierForm
        categories={categories}
        initial={{
          id: supplier.id,
          name: supplier.name,
          abn: supplier.abn ?? "",
          email: supplier.email ?? "",
          phone: supplier.phone ?? "",
          addressLine1: supplier.addressLine1 ?? "",
          suburb: supplier.suburb ?? "",
          state: supplier.state ?? "QLD",
          postcode: supplier.postcode ?? "",
          accountNumber: supplier.accountNumber ?? "",
          contactName: supplier.contactName ?? "",
          paymentTermsDays: supplier.paymentTermsDays,
          defaultCategoryId: supplier.defaultCategoryId ?? "",
          notes: supplier.notes ?? "",
        }}
      />
    </div>
  );
}
