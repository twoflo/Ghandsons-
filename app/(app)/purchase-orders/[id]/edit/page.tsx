import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getPurchaseOrder, getPoLines } from "@/modules/procurement/queries";
import { getPoFormOptions } from "@/modules/procurement/form-data";
import { PurchaseOrderForm } from "@/modules/procurement/po-form";
import { PageHeader, Alert } from "@/components/ui";

export const metadata = { title: "Edit purchase order" };
export const dynamic = "force-dynamic";

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!can(user.role, "po.manage")) redirect(`/purchase-orders/${id}`);

  const [po, lines, options] = await Promise.all([
    getPurchaseOrder(id), getPoLines(id), getPoFormOptions(),
  ]);
  if (!po) notFound();

  if (po.status === "received" || po.status === "invoiced") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={po.poNumber} back={{ href: `/purchase-orders/${id}`, label: "Back" }} />
        <Alert tone="warn" title="This order is closed">
          It&apos;s been delivered, so the lines are locked. Raise another order if you need more.
        </Alert>
      </div>
    );
  }

  const taxRateBp = (taxRateId: string | null) =>
    options.taxRates.find((r) => r.id === taxRateId)?.rateBp ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${po.poNumber}`}
        subtitle={po.supplierName}
        back={{ href: `/purchase-orders/${id}`, label: "Back to the order" }}
      />
      <PurchaseOrderForm
        {...options}
        initial={{
          id: po.id,
          supplierId: po.supplierId,
          jobId: po.jobId ?? "",
          orderDate: po.orderDate ?? "",
          expectedDate: po.expectedDate ?? "",
          deliverTo: po.deliverTo ?? "",
          notes: po.notes ?? "",
          lines: lines.map((l) => ({
            key: l.id,
            id: l.id,
            description: l.description,
            quantity: String(Number(l.quantity)),
            unit: l.unit,
            unitCostCents: l.unitCostCents,
            taxRateId: l.taxRateId,
            taxRateBp: taxRateBp(l.taxRateId),
          })),
        }}
      />
    </div>
  );
}
