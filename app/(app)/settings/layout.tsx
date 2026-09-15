import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SettingsNav } from "@/components/settings-nav";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" subtitle="How the business, the paperwork and the app behave" />
      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6">
        <SettingsNav role={user.role} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
