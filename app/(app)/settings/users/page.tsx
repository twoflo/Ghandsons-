import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { UserEditor } from "@/modules/settings/editors";

export const metadata = { title: "Who can sign in" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user.role, "users.manage")) redirect("/settings");

  const people = (await db.execute(sql`
    SELECT id, full_name AS "fullName", email, phone, role::text AS role,
           is_active AS "isActive", last_login_at::text AS "lastLoginAt"
    FROM users WHERE deleted_at IS NULL ORDER BY is_active DESC, full_name
  `)) as unknown as Array<{
    id: string; fullName: string; email: string; phone: string | null;
    role: string; isActive: boolean; lastLoginAt: string | null;
  }>;

  return <UserEditor people={people} currentUserId={user.id} />;
}
