import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { BusinessForm } from "@/modules/settings/business-form";

export const metadata = { title: "Business details" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getSettings();

  return (
    <BusinessForm
      readOnly={!can(user.role, "settings.manage")}
      initial={{
        tradingName: settings.tradingName,
        legalName: settings.legalName,
        abn: settings.abn,
        acn: settings.acn,
        licenceNumber: settings.licenceNumber,
        email: settings.email,
        phone: settings.phone,
        website: settings.website,
        addressLine1: settings.addressLine1,
        suburb: settings.suburb,
        state: settings.state,
        postcode: settings.postcode,
        timezone: settings.timezone,
        financialYearStartMonth: settings.financialYearStartMonth,
        defaultPaymentTermsDays: settings.defaultPaymentTermsDays,
        defaultMarkupBp: settings.defaultMarkupBp,
        quoteValidDays: settings.quoteValidDays,
        bankAccountName: settings.bankAccountName,
        bankBsb: settings.bankBsb,
        bankAccountNumber: settings.bankAccountNumber,
        invoiceFooter: settings.invoiceFooter,
        quoteTerms: settings.quoteTerms,
      }}
    />
  );
}
