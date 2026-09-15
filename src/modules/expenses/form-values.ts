import { isoDate } from "@/lib/dates";

export type ExpenseFormValues = {
  id?: string;
  jobId: string;
  supplierId: string;
  supplierNameRaw: string;
  categoryId: string;
  expenseDate: string;
  description: string;
  totalCents: number;
  taxCents: number | null;
  hasGst: boolean;
  isBillable: boolean;
  paymentMethod: string;
  reference: string;
  notes: string;
  receiptFileId: string | null;
  receiptUploadId: string | null;
  source: "manual" | "receipt" | "purchase_order" | "import";
};

/** A fresh, empty expense. Server pages seed the form with this. */
export function blankExpense(overrides: Partial<ExpenseFormValues> = {}): ExpenseFormValues {
  return {
    jobId: "",
    supplierId: "",
    supplierNameRaw: "",
    categoryId: "",
    expenseDate: isoDate(new Date()),
    description: "",
    totalCents: 0,
    taxCents: null,
    hasGst: true,
    isBillable: true,
    paymentMethod: "card",
    reference: "",
    notes: "",
    receiptFileId: null,
    receiptUploadId: null,
    source: "manual",
    ...overrides,
  };
}
