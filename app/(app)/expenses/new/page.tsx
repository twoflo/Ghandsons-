import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getExpenseFormOptions } from "@/modules/expenses/queries";
import { ExpenseForm } from "@/modules/expenses/expense-form";
import { blankExpense } from "@/modules/expenses/form-values";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Add an expense" };
export const dynamic = "force-dynamic";

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "expenses.create")) redirect("/expenses");

  const [{ jobId }, options] = await Promise.all([searchParams, getExpenseFormOptions()]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Add an expense"
        subtitle="Type the total off the docket — the GST is worked out for you."
        back={{ href: "/expenses", label: "All expenses" }}
      />
      <ExpenseForm {...options} initial={blankExpense({ jobId: jobId ?? "" })} />
    </div>
  );
}
