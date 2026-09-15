import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getExpense, getExpenseFormOptions } from "@/modules/expenses/queries";
import { ExpenseForm } from "@/modules/expenses/expense-form";
import { PageHeader, Alert } from "@/components/ui";

export const metadata = { title: "Edit expense" };
export const dynamic = "force-dynamic";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!can(user.role, "expenses.manage")) redirect(`/expenses/${id}`);

  const [expense, options] = await Promise.all([getExpense(id), getExpenseFormOptions()]);
  if (!expense) notFound();

  if (expense.billed) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Edit expense" back={{ href: `/expenses/${id}`, label: "Back" }} />
        <Alert tone="warn" title="This expense is on an invoice">
          It&apos;s been charged on to {expense.billedInvoiceNumber}. Take it off that invoice first if it
          needs changing.
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit expense"
        subtitle={expense.description}
        back={{ href: `/expenses/${id}`, label: "Back to the expense" }}
      />
      <ExpenseForm
        {...options}
        receiptUrl={expense.receiptFileId ? `/api/files/${expense.receiptFileId}` : null}
        initial={{
          id: expense.id,
          jobId: expense.jobId ?? "",
          supplierId: expense.supplierId ?? "",
          supplierNameRaw: expense.supplierNameRaw ?? "",
          categoryId: expense.categoryId ?? "",
          expenseDate: expense.expenseDate,
          description: expense.description,
          totalCents: expense.totalCents,
          taxCents: expense.taxCents,
          hasGst: expense.taxCents > 0,
          isBillable: expense.isBillable,
          paymentMethod: expense.paymentMethod,
          reference: expense.reference ?? "",
          notes: expense.notes ?? "",
          receiptFileId: expense.receiptFileId,
          receiptUploadId: expense.receiptUploadId,
          source: expense.source as "manual" | "receipt" | "purchase_order" | "import",
        }}
      />
    </div>
  );
}
