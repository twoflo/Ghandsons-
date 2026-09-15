export type Ctx = {
  gstRateId: string;
  gstFreeRateId: string;
  users: Record<string, string>;
  jobTypes: Record<string, string>;
  categories: Record<string, string>;
  priceBook: Record<string, string>;
  clients: Record<string, string>;
  contacts: Record<string, string>;
  sites: Record<string, string>;
  suppliers: Record<string, string>;
  jobs: Record<string, string>;
  quotes: Record<string, string>;
  invoices: Record<string, string>;
  logoFileId: string | null;
};

export const GST_BP = 1000;

/** Everything is dated relative to this so the demo always looks current. */
export const TODAY = new Date();

export function dayOffset(days: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function atTime(days: number, hour: number, minute = 0): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}
