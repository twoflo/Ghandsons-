export { COMPLIANCE_KINDS, SEVERITIES, SAFETY_DOC_KINDS } from "./constants";

import { sql } from "drizzle-orm";
import { db } from "@/db";

async function rows<T>(query: Parameters<typeof db.execute>[0]): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export type ComplianceItem = {
  id: string;
  subjectType: string;
  subjectId: string | null;
  subjectLabel: string;
  kind: string;
  name: string;
  identifier: string | null;
  issuer: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  coverageCents: number | null;
  fileId: string | null;
  remindDaysBefore: number;
  isRequired: boolean;
  notes: string | null;
  daysLeft: number | null;
  state: "expired" | "due" | "ok" | "no_expiry";
};

export async function listComplianceItems(
  filters: { subjectType?: string; subjectId?: string; state?: string } = {},
): Promise<ComplianceItem[]> {
  return rows<ComplianceItem>(sql`
    SELECT ci.id, ci.subject_type::text AS "subjectType", ci.subject_id AS "subjectId",
           ci.subject_label AS "subjectLabel", ci.kind::text AS kind, ci.name,
           ci.identifier, ci.issuer,
           ci.issue_date::text AS "issueDate", ci.expiry_date::text AS "expiryDate",
           ci.coverage_cents AS "coverageCents", ci.file_id AS "fileId",
           ci.remind_days_before AS "remindDaysBefore", ci.is_required AS "isRequired",
           ci.notes,
           CASE WHEN ci.expiry_date IS NULL THEN NULL
                ELSE (ci.expiry_date - CURRENT_DATE)::int END AS "daysLeft",
           CASE
             WHEN ci.expiry_date IS NULL THEN 'no_expiry'
             WHEN ci.expiry_date < CURRENT_DATE THEN 'expired'
             WHEN ci.expiry_date <= CURRENT_DATE + ci.remind_days_before THEN 'due'
             ELSE 'ok'
           END AS state
    FROM compliance_items ci
    WHERE ci.deleted_at IS NULL
      ${filters.subjectType ? sql`AND ci.subject_type::text = ${filters.subjectType}` : sql``}
      ${filters.subjectId ? sql`AND ci.subject_id = ${filters.subjectId}` : sql``}
    ORDER BY
      CASE
        WHEN ci.expiry_date IS NULL THEN 3
        WHEN ci.expiry_date < CURRENT_DATE THEN 0
        WHEN ci.expiry_date <= CURRENT_DATE + ci.remind_days_before THEN 1
        ELSE 2
      END,
      ci.expiry_date NULLS LAST
  `);
}

export type ComplianceSummary = { expired: number; due: number; ok: number; total: number };

export async function getComplianceSummary(): Promise<ComplianceSummary> {
  const [row] = await rows<ComplianceSummary>(sql`
    SELECT
      COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date < CURRENT_DATE)::int AS expired,
      COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date >= CURRENT_DATE
                         AND expiry_date <= CURRENT_DATE + remind_days_before)::int AS due,
      COUNT(*) FILTER (WHERE expiry_date IS NULL OR expiry_date > CURRENT_DATE + remind_days_before)::int AS ok,
      COUNT(*)::int AS total
    FROM compliance_items WHERE deleted_at IS NULL
  `);
  return row ?? { expired: 0, due: 0, ok: 0, total: 0 };
}

export type SafetyDoc = {
  id: string;
  jobId: string;
  jobNumber: string | null;
  kind: string;
  title: string;
  version: string;
  fileId: string | null;
  validFrom: string | null;
  validTo: string | null;
  highRiskActivities: string[];
  signoffs: Array<{ name: string; signedAt: string }>;
  createdByName: string | null;
};

export async function listSafetyDocs(jobId?: string): Promise<SafetyDoc[]> {
  return rows<SafetyDoc>(sql`
    SELECT sd.id, sd.job_id AS "jobId", j.job_number AS "jobNumber",
           sd.kind::text AS kind, sd.title, sd.version, sd.file_id AS "fileId",
           sd.valid_from::text AS "validFrom", sd.valid_to::text AS "validTo",
           sd.high_risk_activities AS "highRiskActivities",
           u.full_name AS "createdByName",
           COALESCE((
             SELECT json_agg(json_build_object('name', ss.signed_name, 'signedAt', ss.signed_at::text)
                             ORDER BY ss.signed_at)
             FROM safety_signoffs ss WHERE ss.safety_doc_id = sd.id AND ss.deleted_at IS NULL
           ), '[]'::json) AS signoffs
    FROM safety_docs sd
    LEFT JOIN jobs j ON j.id = sd.job_id
    LEFT JOIN users u ON u.id = sd.created_by
    WHERE sd.deleted_at IS NULL
      ${jobId ? sql`AND sd.job_id = ${jobId}` : sql``}
    ORDER BY sd.created_at DESC
  `);
}

export type IncidentRow = {
  id: string;
  incidentNumber: string;
  jobId: string | null;
  jobNumber: string | null;
  jobTitle: string | null;
  occurredAt: string;
  severity: string;
  personInvolved: string | null;
  description: string;
  immediateAction: string | null;
  correctiveAction: string | null;
  reportedToAuthority: boolean;
  authorityReference: string | null;
  status: string;
  closedAt: string | null;
  reportedByName: string | null;
};

export async function listIncidents(filters: { jobId?: string; status?: string } = {}): Promise<IncidentRow[]> {
  return rows<IncidentRow>(sql`
    SELECT i.id, i.incident_number AS "incidentNumber",
           i.job_id AS "jobId", j.job_number AS "jobNumber", j.title AS "jobTitle",
           i.occurred_at::text AS "occurredAt", i.severity::text AS severity,
           i.person_involved AS "personInvolved", i.description,
           i.immediate_action AS "immediateAction", i.corrective_action AS "correctiveAction",
           i.reported_to_authority AS "reportedToAuthority",
           i.authority_reference AS "authorityReference",
           i.status, i.closed_at::text AS "closedAt", u.full_name AS "reportedByName"
    FROM incidents i
    LEFT JOIN jobs j ON j.id = i.job_id
    LEFT JOIN users u ON u.id = i.reported_by
    WHERE i.deleted_at IS NULL
      ${filters.jobId ? sql`AND i.job_id = ${filters.jobId}` : sql``}
      ${filters.status ? sql`AND i.status = ${filters.status}` : sql``}
    ORDER BY i.occurred_at DESC
  `);
}

export async function getComplianceSubjects() {
  const [workers, suppliers] = await Promise.all([
    rows<{ id: string; fullName: string }>(sql`
      SELECT id, full_name AS "fullName" FROM users
      WHERE deleted_at IS NULL AND is_active ORDER BY full_name
    `),
    rows<{ id: string; name: string }>(sql`
      SELECT id, name FROM suppliers WHERE deleted_at IS NULL ORDER BY name
    `),
  ]);
  return { workers, suppliers };
}
