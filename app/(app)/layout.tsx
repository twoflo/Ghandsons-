import { redirect } from "next/navigation";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { businessSettings, receiptUploads } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AppShell } from "@/components/app-shell";
import { NAV_ITEMS } from "@/components/nav-config";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [settings] = await db.select().from(businessSettings).limit(1);

  let reviewCount = 0;
  if (can(user.role, "receipts.review")) {
    const [row] = await db
      .select({ n: count() })
      .from(receiptUploads)
      .where(and(eq(receiptUploads.status, "needs_review"), isNull(receiptUploads.deletedAt)));
    reviewCount = row?.n ?? 0;
  }

  const items = NAV_ITEMS.filter((item) => !item.permission || can(user.role, item.permission));

  return (
    <AppShell
      user={{ fullName: user.fullName, role: user.role, email: user.email }}
      items={items}
      businessName={settings?.tradingName ?? "Ghandsons"}
      reviewCount={reviewCount}
    >
      {children}
    </AppShell>
  );
}
