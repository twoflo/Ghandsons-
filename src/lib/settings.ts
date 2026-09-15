import { db } from "@/db";
import { businessSettings, taxRates } from "@/db/schema";
import { eq } from "drizzle-orm";

export type BusinessSettings = typeof businessSettings.$inferSelect;

/**
 * The singleton settings row. Falls back to sane Australian defaults so a
 * fresh database still renders rather than crashing on a missing row.
 */
export async function getSettings(): Promise<BusinessSettings> {
  const [row] = await db.select().from(businessSettings).limit(1);
  if (row) return row;
  return {
    id: "default",
    tradingName: "Your business",
    legalName: null, abn: null, acn: null, licenceNumber: null,
    email: null, phone: null, website: null,
    addressLine1: null, addressLine2: null, suburb: null, state: null,
    postcode: null, country: "Australia",
    logoFileId: null, currency: "AUD", locale: "en-AU",
    timezone: "Australia/Brisbane", financialYearStartMonth: 7,
    defaultPaymentTermsDays: 14, defaultMarkupBp: 2000, quoteValidDays: 30,
    bankAccountName: null, bankBsb: null, bankAccountNumber: null,
    invoiceFooter: null, quoteTerms: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  };
}

export async function getDefaultTaxRate() {
  const [row] = await db.select().from(taxRates).where(eq(taxRates.isDefault, true)).limit(1);
  return row ?? null;
}

export async function getTaxRates() {
  return db.select().from(taxRates).where(eq(taxRates.isActive, true));
}
