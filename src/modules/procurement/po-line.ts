/** A purchase-order line while it's being edited. Kept out of the client
 *  component so server pages can seed a blank form. */
export type PoEditorLine = {
  key: string;
  id?: string;
  description: string;
  quantity: string;
  unit: string;
  unitCostCents: number;
  taxRateId: string | null;
  taxRateBp: number;
};

export function blankPoLine(taxRateId: string | null, taxRateBp: number): PoEditorLine {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    description: "",
    quantity: "1",
    unit: "ea",
    unitCostCents: 0,
    taxRateId,
    taxRateBp,
  };
}
