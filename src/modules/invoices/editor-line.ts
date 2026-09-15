/** An invoice line while it's being edited. Kept out of the client component
 *  so server pages can seed a blank form. */
export type InvoiceEditorLine = {
  key: string;
  id?: string;
  isHeading: boolean;
  /** 'manual' | 'expense' | 'variation' | 'deposit' | 'progress' | 'quote_line' */
  sourceType: string;
  sourceId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPriceCents: number;
  taxRateId: string | null;
  taxRateBp: number;
};

export function blankInvoiceLine(taxRateId: string | null, taxRateBp: number): InvoiceEditorLine {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    isHeading: false,
    sourceType: "manual",
    sourceId: null,
    description: "",
    quantity: "1",
    unit: "ea",
    unitPriceCents: 0,
    taxRateId,
    taxRateBp,
  };
}
