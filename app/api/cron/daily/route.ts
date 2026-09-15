import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { refreshOverdueStatuses } from "@/modules/invoices/actions";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * The daily tidy-up. Point a Vercel cron at this once a morning.
 *
 * It only does things that are true regardless of who's looking: marking
 * invoices overdue, raising reminders for expiries, and flagging quotes that
 * have run past their date. Everything else is computed on read.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = request.headers.get("authorization");
    if (provided !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Not authorised" }, { status: 401 });
    }
  }

  const overdue = await refreshOverdueStatuses();

  const expired = (await db.execute(sql`
    UPDATE quotes SET status = 'expired', updated_at = now()
    WHERE deleted_at IS NULL AND status = 'sent'
      AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE
    RETURNING id
  `)) as unknown as Array<{ id: string }>;

  /* One reminder row per compliance item entering its warning window, so the
   * same licence isn't nagged about every single morning. */
  const reminders = (await db.execute(sql`
    INSERT INTO compliance_reminders (compliance_item_id, due_on)
    SELECT ci.id, ci.expiry_date
    FROM compliance_items ci
    WHERE ci.deleted_at IS NULL
      AND ci.expiry_date IS NOT NULL
      AND ci.expiry_date <= CURRENT_DATE + ci.remind_days_before
      AND NOT EXISTS (
        SELECT 1 FROM compliance_reminders r
        WHERE r.compliance_item_id = ci.id AND r.due_on = ci.expiry_date
      )
    RETURNING id
  `)) as unknown as Array<{ id: string }>;

  const notifications = (await db.execute(sql`
    INSERT INTO notifications (user_id, kind, title, body, href, severity)
    SELECT u.id, 'compliance_expiry',
           ci.name || ' expires ' ||
             CASE WHEN ci.expiry_date < CURRENT_DATE THEN 'was due ' ELSE 'in ' END ||
             ABS(ci.expiry_date - CURRENT_DATE)::text || ' days',
           ci.subject_label, '/compliance',
           CASE WHEN ci.expiry_date < CURRENT_DATE THEN 'danger' ELSE 'warning' END
    FROM compliance_items ci
    CROSS JOIN users u
    WHERE ci.deleted_at IS NULL AND u.deleted_at IS NULL AND u.is_active AND u.role = 'owner'
      AND ci.expiry_date IS NOT NULL
      AND ci.expiry_date <= CURRENT_DATE + ci.remind_days_before
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = u.id AND n.kind = 'compliance_expiry'
          AND n.body = ci.subject_label AND n.created_at > CURRENT_DATE - 7
      )
    RETURNING id
  `)) as unknown as Array<{ id: string }>;

  const summary = `Daily run: ${overdue} invoices now overdue, ${expired.length} quotes expired, ${reminders.length} renewal reminders, ${notifications.length} notifications`;

  await audit({
    entityType: "system",
    entityId: "00000000-0000-0000-0000-000000000000",
    action: "update",
    summary,
    actorLabel: "Scheduled job",
  });

  return NextResponse.json({
    ok: true,
    invoicesMarkedOverdue: overdue,
    quotesExpired: expired.length,
    remindersRaised: reminders.length,
    notificationsCreated: notifications.length,
  });
}
