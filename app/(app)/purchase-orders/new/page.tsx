import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPoFormOptions } from "@/modules/procurement/form-data";
import { PurchaseOrderForm } from "@/modules/procurement/po-form";
import { blankPoLine } from "@/modules/procurement/po-line";
import { PageHeader } from "@/components/ui";
import { isoDate, addDaysIso } from "@/lib/dates";

export const metadata = { title: "New purchase order" };
export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; jobId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "po.manage")) redirect("/purchase-orders");

  const [{ supplierId, jobId }, options] = await Promise.all([searchParams, getPoFormOptions()]);
  const rate = options.taxRates.find((r) => r.rateBp > 0) ?? options.taxRates[0];
  const today = isoDate(new Date());

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New purchase order"
        subtitle="Worth doing for anything over a few hundred dollars — it's how you check the invoice later."
        back={{ href: "/purchase-orders", label: "All orders" }}
      />
      <PurchaseOrderForm
        {...options}
        initial={{
          supplierId: supplierId ?? "",
          jobId: jobId ?? "",
          orderDate: today,
          expectedDate: addDaysIso(today, 7),
          deliverTo: "",
          notes: "",
          lines: [blankPoLine(rate?.id ?? null, rate?.rateBp ?? 0)],
        }}
      />
    </div>
  );
}
