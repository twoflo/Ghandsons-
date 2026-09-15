import { requireUser } from "@/lib/auth";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type Role } from "@/lib/permissions";
import { PageHeader, Card, CardHeader, DataList } from "@/components/ui";
import { ChangePasswordForm } from "@/modules/auth/change-password-form";

export const metadata = { title: "Your account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Your account" subtitle={user.email} />

      <Card>
        <CardHeader title="You" />
        <div className="px-4 py-2">
          <DataList
            rows={[
              { label: "Name", value: user.fullName },
              { label: "Email", value: user.email },
              { label: "Phone", value: user.phone ?? "—" },
              {
                label: "Access",
                value: (
                  <span>
                    {ROLE_LABELS[user.role as Role]}
                    <span className="block text-sm text-ink-500">{ROLE_DESCRIPTIONS[user.role as Role]}</span>
                  </span>
                ),
              },
            ]}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Change your password"
          subtitle="Use something long you'll remember — a short sentence beats a jumble of symbols."
        />
        <div className="p-4">
          <ChangePasswordForm mustChange={user.mustChangePassword} />
        </div>
      </Card>
    </div>
  );
}
